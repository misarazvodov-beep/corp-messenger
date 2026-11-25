const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { sendLoginCode } = require('../mailer');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Шаг 1. Сотрудник вводит email, мы отправляем ему код
router.post('/request-code', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Введите правильный email' });
    }

    // Не чаще одного кода в минуту на один email
    const recent = await pool.query(
      `SELECT 1 FROM login_codes
       WHERE email = $1 AND created_at > NOW() - INTERVAL '60 seconds'`,
      [email]
    );
    if (recent.rowCount > 0) {
      return res.status(429).json({ error: 'Код уже отправлен. Подождите минуту.' });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    await pool.query(
      `INSERT INTO login_codes (email, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [email, code]
    );

    await sendLoginCode(email, code);

    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка отправки кода:', err.message);
    res.status(500).json({ error: 'Не удалось отправить код. Попробуйте позже.' });
  }
});

// Шаг 2. Сотрудник вводит код, мы выдаём "пропуск" (токен)
router.post('/verify', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();

    const found = await pool.query(
      `SELECT id FROM login_codes
       WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [email, code]
    );

    if (found.rowCount === 0) {
      return res.status(400).json({ error: 'Неверный или просроченный код' });
    }

    await pool.query('UPDATE login_codes SET used = TRUE WHERE id = $1', [found.rows[0].id]);

    // Если сотрудника ещё нет в базе, создаём. Имя пока берём из email.
    const name = email.split('@')[0];
    const userResult = await pool.query(
      `INSERT INTO users (email, name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, name`,
      [email, name]
    );
    const user = userResult.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user });
  } catch (err) {
    console.error('Ошибка входа:', err.message);
    res.status(500).json({ error: 'Ошибка входа. Попробуйте позже.' });
  }
});

module.exports = router;