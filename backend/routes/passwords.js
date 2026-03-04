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
    const rows = await db.queryFallback('passwords', 'find', [{ user_id: req.user.userId }]).then(c => c.sort({ site: 1 }).toArray());
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
    await db.queryFallback('passwords', 'insertOne', [{
      id, user_id: req.user.userId, site: site.trim(), username: username.trim(), encrypted_password, created_at: new Date(), updated_at: new Date()
    }]);

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
    const result = await db.queryFallback('passwords', 'updateOne', [
      { id, user_id: req.user.userId },
      { $set: { site: site.trim(), username: (username || '').trim(), encrypted_password, updated_at: new Date() } }
    ]);

    if (!result.modifiedCount && !result.matchedCount) {
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
    const result = await db.queryFallback('passwords', 'deleteOne', [{ id: req.params.id, user_id: req.user.userId }]);

    if (!result.deletedCount) {
      return res.status(404).json({ error: 'Registo não encontrado.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[passwords DELETE]', err);
    res.status(500).json({ error: 'Erro ao eliminar password.' });
  }
});

module.exports = router;
