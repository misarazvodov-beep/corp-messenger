const jwt = require('jsonwebtoken');

// Проверяет "пропуск" (токен), который сервер выдал при входе
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Нужно войти' });
  }

  try {
    // Если токен настоящий, достаём из него id и email сотрудника
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Войдите заново' });
  }
}

module.exports = { requireAuth };