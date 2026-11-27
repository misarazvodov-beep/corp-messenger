const express = require('express');
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { sendWelcome } = require('../mailer');

const router = express.Router();
const scrypt = promisify(crypto.scrypt);

const REGISTER_SECRET = process.env.JWT_SECRET + ':register';

const DEPARTMENTS = [
  'HR',
  'QA',
  'Разработка',
  'Бухгалтерия',
  'Финансовый отдел',
  'Отдел продаж',
  'Маркетинговый отдел',
];

// Пароль хранится только в виде "отпечатка"
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return salt + ':' + key.toString('hex');
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d) && d >= new Date('1920-01-01') && d <= new Date();
}

// Регистрация: ФИО, дата рождения, отдел, должность, о себе, пароль
router.post('/register', async (req, res) => {
  try {
    let email;
    try {
      email = jwt.verify(String(req.body.registrationToken || ''), REGISTER_SECRET).email;
    } catch (err) {
      return res.status(401).json({ error: 'Подтвердите почту заново' });
    }

    const fullName = String(req.body.fullName || '').trim().replace(/\s+/g, ' ');
    const birthDate = String(req.body.birthDate || '');
    const department = String(req.body.department || '');
    const position = String(req.body.position || '').trim();
    const about = String(req.body.about || '').trim().slice(0, 500);
    const password = String(req.body.password || '');

    if (fullName.split(' ').length < 2 || fullName.length > 100) {
      return res.status(400).json({ error: 'Укажите ФИО: фамилия, имя и отчество' });
    }
    if (!isValidDate(birthDate)) {
      return res.status(400).json({ error: 'Укажите правильную дату рождения' });
    }
    if (!DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: 'Выберите отдел из списка' });
    }
    if (position.length < 2 || position.length > 100) {
      return res.status(400).json({ error: 'Укажите должность' });
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
      `INSERT INTO users (email, name, password_hash, registered,
                          birth_date, department, position, about)
       VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           registered = TRUE,
           must_change_password = FALSE,
           birth_date = EXCLUDED.birth_date,
           department = EXCLUDED.department,
           position = EXCLUDED.position,
           about = EXCLUDED.about
       RETURNING id, email, name, avatar_url, department, position`,
      [email, fullName, hash, birthDate, department, position, about || null]
    );
    const user = result.rows[0];

    sendWelcome(email, fullName).catch((err) => {
      console.error('Не удалось отправить письмо о регистрации:', err.message);
    });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });
    res.json({ token, user });
  } catch (err) {
    console.error('Ошибка регистрации:', err.message);
    res.status(500).json({ error: 'Ошибка регистрации. Попробуйте позже.' });
  }
});

module.exports = router;