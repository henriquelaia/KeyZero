const router = require('express').Router();
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { SignJWT } = require('jose');
const db = require('../db');

const rpName = 'KeyZero Zero-Knowledge Vault';
const rpID = 'localhost'; // In production, this should be the exact domain name.
const origin = `http://${rpID}:5173`;

async function signToken(payload) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || '7d')
    .sign(secret);
}

// Helper para guardar challenge
async function saveChallenge(userId, challenge) {
  await db.queryFallback('auth_challenges', 'updateOne', 
    [{ user_id: userId }, { $set: { user_id: userId, challenge, created_at: new Date() } }, { upsert: true }]
  );
}

// Helper para obter e remover challenge
async function consumeChallenge(userId) {
  const rows = await db.queryFallback('auth_challenges', 'find', [{ user_id: userId }]).then(c => c.toArray());
  if (!rows.length) return null;
  await db.queryFallback('auth_challenges', 'deleteOne', [{ user_id: userId }]);
  return rows[0].challenge;
}

// ─── REGISTO DE PASSKEY ──────────────────────────────────────────────────────

// 1. Obter opções de registo (requer login prévio, associamos à conta existente)
router.post('/register/options', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });

    const userRows = await db.queryFallback('users', 'find', [{ id: userId }]).then(c => c.toArray());
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });

    const userEmail = userRows[0].email;

    const creds = await db.queryFallback('passkey_credentials', 'find', [{ user_id: userId }]).then(c => c.toArray());
    const excludeCredentials = creds.map(c => ({
      id: Buffer.from(c.id, 'base64url'),
      type: 'public-key',
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(userId, 'utf-8'),
      userName: userEmail,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      extensions: {
        prf: {
          eval: {}
        }
      }
    });

    options.extensions = {
      prf: {
        eval: {
          first: new Uint8Array(32).fill(1)
        }
      }
    };

    await saveChallenge(userId, options.challenge);

    res.json(options);
  } catch (err) {
    console.error('[passkeys/register/options]', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// 2. Verificar registo
router.post('/register/verify', async (req, res) => {
  try {
    const { userId, response } = req.body;
    
    const expectedChallenge = await consumeChallenge(userId);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expired or not found' });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

      const base64CredentialID = Buffer.from(credentialID).toString('base64url');
      const base64PublicKey = Buffer.from(credentialPublicKey).toString('base64');
      
      const transports = response.response.transports 
        ? response.response.transports.join(',') 
        : '';

      await db.queryFallback('passkey_credentials', 'insertOne', [{
        id: base64CredentialID, 
        user_id: userId, 
        public_key: base64PublicKey, 
        counter: counter, 
        transports: transports,
        created_at: new Date()
      }]);

      return res.json({ verified: true });
    }

    res.status(400).json({ error: 'Verification failed' });
  } catch (err) {
    console.error('[passkeys/register/verify]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── LOGIN COM PASSKEY ───────────────────────────────────────────────────────

// 1. Obter opções de login (descobrimento)
router.post('/login/options', async (req, res) => {
  try {
    const { email } = req.body;

    let allowCredentials = [];
    let userId = null;
    let salt = null;

    if (email) {
      const users = await db.queryFallback('users', 'find', [{ email }]).then(c => c.toArray());
      if (users.length) {
        userId = users[0].id;
        salt = users[0].salt;
        const creds = await db.queryFallback('passkey_credentials', 'find', [{ user_id: userId }]).then(c => c.toArray());
        allowCredentials = creds.map(c => ({
          id: Buffer.from(c.id, 'base64url'),
          type: 'public-key',
          transports: c.transports ? c.transports.split(',') : [],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: allowCredentials.length ? allowCredentials : undefined,
      userVerification: 'required',
    });

    if (userId) {
      await saveChallenge(userId, options.challenge);
    } else {
      await saveChallenge('global_challenge_cache', options.challenge);
    }

    res.json({ options, salt, userId });
  } catch (err) {
    console.error('[passkeys/login/options]', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// 2. Verificar login
router.post('/login/verify', async (req, res) => {
  try {
    const { response, email } = req.body;
    
    // Pega o id da credencial
    const credentialIDBase64 = response.id;

    // Procuremos a credencial na BD
    const creds = await db.queryFallback('passkey_credentials', 'find', [{ id: credentialIDBase64 }]).then(c => c.toArray());
    
    if (!creds.length) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const { user_id, public_key, counter } = creds[0];
    const authenticator = {
      credentialID: Buffer.from(credentialIDBase64, 'base64url'),
      credentialPublicKey: Buffer.from(public_key, 'base64'),
      counter: counter,
    };

    // Pegar challenge 
    let expectedChallenge = await consumeChallenge(user_id);
    if (!expectedChallenge) {
       expectedChallenge = await consumeChallenge('global_challenge_cache'); // fallback attempt
    }

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expired or not found' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator,
      requireUserVerification: true,
    });

    if (verification.verified) {
      // Update counter
      await db.queryFallback('passkey_credentials', 'updateOne', [
        { id: credentialIDBase64 },
        { $set: { counter: verification.authenticationInfo.newCounter, updated_at: new Date() } }
      ]);

      const token = await signToken({ userId: user_id });
      return res.json({ verified: true, token, userId: user_id });
    }

    res.status(400).json({ error: 'Verification failed' });
  } catch (err) {
    console.error('[passkeys/login/verify]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
