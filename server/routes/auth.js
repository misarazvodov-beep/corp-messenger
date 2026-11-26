const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendLoginCode, sendWelcome, sendTempPassword } = require('../mailer');

const router = express.Router();
const scrypt = promisify(crypto.scrypt);

// Отдельный ключ для "пропуска на регистрацию": им нельзя войти в мессенджер
const REGISTER_SECRET = process.env.JWT_SECRET + ':register';

// ---------- Помощники ----------

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Превращаем пароль в "отпечаток", самого пароля в базе нет
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return salt + ':' + key.toString('hex');
}

async function checkPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// "Пропуск" для входа в мессенджер
function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

// Защита от подбора пароля: 5 ошибок, и вход закрыт на 5 минут
const failed = new Map();

function isBlocked(email) {
  const f = failed.get(email);
  return Boolean(f && f.until > Date.now());
}

function registerFail(email) {
  const f = failed.get(email) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) {
    f.until = Date.now() + 5 * 60 * 1000;
    f.count = 0;
  }
  failed.set(email, f);
}

// ---------- Регистрация ----------

// Шаг 1. Человек вводит почту, мы отправляем код
router.post('/request-code', async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Введите правильный email' });
    }

    const existing = await pool.query('SELECT registered FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0 && existing.rows[0].registered) {
      return res.status(400).json({ error: 'Эта почта уже зарегистрирована. Войдите по паролю.' });
    }

    // Не чаще одного кода в минуту на одну почту
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

// Шаг 2. Человек вводит код, мы подтверждаем почту
router.post('/verify-email', async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
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

    // Пропуск на регистрацию действует 15 минут
    const registrationToken = jwt.sign({ email }, REGISTER_SECRET, { expiresIn: '15m' });
    res.json({ registrationToken });
  } catch (err) {
    console.error('Ошибка подтверждения почты:', err.message);
    res.status(500).json({ error: 'Ошибка. Попробуйте позже.' });
  }
});

// Шаг 3. Ник и пароль: регистрация завершена
router.post('/register', async (req, res) => {
  try {
    let email;
    try {
      email = jwt.verify(String(req.body.registrationToken || ''), REGISTER_SECRET).email;
    } catch (err) {
      return res.status(401).json({ error: 'Подтвердите почту заново' });
    }

    const name = String(req.body.nickname || '').trim();
    const password = String(req.body.password || '');

    if (name.length < 2 || name.length > 30) {
      return res.status(400).json({ error: 'Ник: от 2 до 30 символов' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль: не короче 8 символов' });
    }

    const existing = await pool.query('SELECT registered FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0 && existing.rows[0].registered) {
      return res.status(400).json({ error: 'Эта почта уже зарегистрирована' });
    }

    const hash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash, registered)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (email) DO UPDATE
       SET name =