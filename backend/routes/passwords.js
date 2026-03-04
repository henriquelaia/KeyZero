/**
 * KeyZero — Rotas CRUD de Passwords
 *
 * TODAS as rotas exigem JWT válido (user_id extraído do token).
 * O servidor APENAS armazena e devolve blobs cifrados — nunca decifra nada.
 * O isolamento por user_id é feito em TODAS as queries para prevenir IDOR.
 */

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

// ─── GET /api/passwords ───────────────────────────────────────────────────────
// Devolve todos os registos cifrados do utilizador autenticado
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, site, username, encrypted_password, created_at, updated_at
       FROM passwords
       WHERE user_id = ?
       ORDER BY site ASC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[passwords GET]', err);
    res.status(500).json({ error: 'Erro ao obter passwords.' });
  }
});

// ─── POST /api/passwords ──────────────────────────────────────────────────────
// Cria um novo registo cifrado
router.post('/', async (req, res) => {
  try {
    const { site, username = '', encrypted_password } = req.body;
    if (!site || !encrypted_password) {
      return res.status(400).json({ error: 'Campos obrigatórios: site, encrypted_password.' });
    }

    // Validação básica do formato (JSON com campos ct e iv)
    try {
      const parsed = JSON.parse(encrypted_password);
      if (!parsed.ct || !parsed.iv) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Formato de encrypted_password inválido.' });
    }

    const id = uuidv4();
    await db.query(
      'INSERT INTO passwords (id, user_id, site, username, encrypted_password) VALUES (?, ?, ?, ?, ?)',
      [id, req.user.userId, site.trim(), username.trim(), encrypted_password]
    );

    res.status(201).json({ id, site, username, encrypted_password });
  } catch (err) {
    console.error('[passwords POST]', err);
    res.status(500).json({ error: 'Erro ao criar password.' });
  }
});

// ─── PUT /api/passwords/:id ───────────────────────────────────────────────────
// Actualiza site, username e/ou encrypted_password
router.put('/:id', async (req, res) => {
  try {
    const { site, username, encrypted_password } = req.body;
    const { id } = req.params;

    if (!site || !encrypted_password) {
      return res.status(400).json({ error: 'Campos obrigatórios: site, encrypted_password.' });
    }

    // user_id no WHERE garante que o utilizador só edita os seus próprios registos (previne IDOR)
    const [result] = await db.query(
      `UPDATE passwords
       SET site = ?, username = ?, encrypted_password = ?
       WHERE id = ? AND user_id = ?`,
      [site.trim(), (username || '').trim(), encrypted_password, id, req.user.userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Registo não encontrado.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[passwords PUT]', err);
    res.status(500).json({ error: 'Erro ao actualizar password.' });
  }
});

// ─── DELETE /api/passwords/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM passwords WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Registo não encontrado.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[passwords DELETE]', err);
    res.status(500).json({ error: 'Erro ao eliminar password.' });
  }
});

module.exports = router;
