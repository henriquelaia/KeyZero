const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'keyzero',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  connectTimeout: 10000,   // 10s de timeout de ligação
});

// Testa a ligação ao iniciar (falha rápido se BD não estiver disponível)
pool.query('SELECT 1')
  .then(() => { console.log('✅ MySQL ligado com sucesso'); })
  .catch(err => { console.error('❌ Erro de ligação à BD:', err.message); });

// Wrapper para manter API simples no resto do código
// mysql2 pool.query() já devolve [rows, fields]
const db = {
  async query(sql, params) {
    const [rows] = await pool.query(sql, params);
    return [rows];
  },
};

module.exports = db;
