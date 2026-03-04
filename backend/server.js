require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/auth/passkeys', require('./routes/passkeys'));
app.use('/api/passwords', require('./routes/passwords'));
app.use('/api/check-url', require('./routes/urlcheck'));

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', project: 'KeyZero' }));


// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🔐 KeyZero Backend — http://localhost:${PORT}`);
  console.log(`   Zero-Knowledge Password Manager — Hackathon Shift to Digital\n`);
});
