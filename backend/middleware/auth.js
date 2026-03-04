const { jwtVerify } = require('jose');

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação em falta.' });
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), secret());
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
