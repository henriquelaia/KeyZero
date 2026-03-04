/**
 * KeyZero — Rotas de Autenticação Zero-Knowledge
 *
 * Registo e login em 2 passos: o cliente deriva o authToken via PBKDF2 e envia
 * apenas o token (nunca a MasterKey). O servidor armazena bcrypt(authToken).
 * O encryptionKey é derivado localmente e nunca sai do browser.
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { SignJWT } = require('jose');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');

const BCRYPT_ROUNDS = 12;

async function signToken(payload) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || '7d')
    .sign(secret);
}

// ─── REGISTO ─────────────────────────────────────────────────────────────────

// Passo 1: Recebe email, gera salt no servidor, devolve { userId, salt }
router.post('/register', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    const existing = await db.queryFallback('users', 'find', [{ email }]).then(c => c.toArray());
    if (existing.length) {
      return res.status(409).json({ error: 'Este email já está registado.' });
    }

    const userId = uuidv4();
    const salt   = crypto.randomBytes(32).toString('hex'); // 256-bit salt

    // Registo temporário — auth_hash fica como 'pending' até ao passo 2
    await db.queryFallback('users', 'insertOne', [{ id: userId, email, salt, auth_hash: 'pending', created_at: new Date() }]);

    res.status(201).json({ userId, salt });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Passo 2: Recebe authToken derivado pelo cliente, guarda bcrypt hash, devolve JWT
router.post('/register/finalize', async (req, res) => {
  try {
    const { userId, authToken } = req.body;
    if (!userId || !authToken) {
      return res.status(400).json({ error: 'Campos em falta.' });
    }

    const rows = await db.queryFallback('users', 'find', [{ id: userId, auth_hash: 'pending' }]).then(c => c.toArray());
    if (!rows.length) {
      return res.status(404).json({ error: 'Sessão de registo não encontrada ou já finalizada.' });
    }

    const authHash = await bcrypt.hash(authToken, BCRYPT_ROUNDS);
    await db.queryFallback('users', 'updateOne', [{ id: userId }, { $set: { auth_hash: authHash } }]);

    const token = await signToken({ userId });
    res.json({ token });
  } catch (err) {
    console.error('[register/finalize]', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────

// Passo 1: Recebe email, devolve { userId, salt } para o cliente derivar as chaves
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email em falta.' });

    const rows = await db.queryFallback('users', 'find', [{ email, auth_hash: { $ne: 'pending' } }]).then(c => c.toArray());

    // Resposta uniforme para não revelar se o email existe (time-constant comparison)
    if (!rows.length) {
      await new Promise(r => setTimeout(r, 200)); // evitar timing oracle
      return res.status(404).json({ error: 'Credenciais inválidas.' });
    }

    res.json({ userId: rows[0].id, salt: rows[0].salt });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Passo 2: Recebe authToken derivado pelo cliente, verifica com bcrypt, devolve JWT
router.post('/login/verify', async (req, res) => {
  try {
    const { userId, authToken } = req.body;
    if (!userId || !authToken) {
      return res.status(400).json({ error: 'Campos em falta.' });
    }

    const rows = await db.queryFallback('users', 'find', [{ id: userId }]).then(c => c.toArray());
    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const valid = await bcrypt.compare(authToken, rows[0].auth_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = await signToken({ userId });
    res.json({ token });
  } catch (err) {
    console.error('[login/verify]', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

module.exports = router;
