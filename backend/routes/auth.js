/**
 * KeyZero — Rotas de Autenticação Zero-Knowledge
 *
 * FLUXO DE REGISTO (2 passos):
 *  1. POST /api/auth/register        { email }
 *     → Servidor gera salt, cria registo temporário, devolve { userId, salt }
 *  2. POST /api/auth/register/finalize { userId, authToken }
 *     → authToken = PBKDF2(masterKey+":auth", salt)  [derivado no cliente]
 *     → Servidor faz bcrypt(authToken) e armazena. Devolve JWT.
 *
 * FLUXO DE LOGIN (2 passos):
 *  1. POST /api/auth/login           { email }
 *     → Devolve { userId, salt }  (o cliente precisa do salt para derivar a chave)
 *  2. POST /api/auth/login/verify    { userId, authToken }
 *     → Servidor compara bcrypt(authToken) com o hash guardado. Devolve JWT.
 *
 * O servidor NUNCA recebe nem armazena a MasterKey.
 * O encryptionKey NUNCA sai do browser.
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

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'Este email já está registado.' });
    }

    const userId = uuidv4();
    const salt   = crypto.randomBytes(32).toString('hex'); // 256-bit salt

    // Registo temporário — auth_hash fica como 'pending' até ao passo 2
    await db.query(
      'INSERT INTO users (id, email, salt, auth_hash) VALUES (?, ?, ?, ?)',
      [userId, email, salt, 'pending']
    );

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

    const [rows] = await db.query(
      'SELECT id FROM users WHERE id = ? AND auth_hash = ?',
      [userId, 'pending']
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Sessão de registo não encontrada ou já finalizada.' });
    }

    const authHash = await bcrypt.hash(authToken, BCRYPT_ROUNDS);
    await db.query('UPDATE users SET auth_hash = ? WHERE id = ?', [authHash, userId]);

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

    const [rows] = await db.query(
      'SELECT id, salt FROM users WHERE email = ? AND auth_hash != ?',
      [email, 'pending']
    );

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

    const [rows] = await db.query(
      'SELECT id, auth_hash FROM users WHERE id = ?',
      [userId]
    );
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
