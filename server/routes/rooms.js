const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Все запросы ниже доступны только вошедшим сотрудникам
router.use(requireAuth);

// 1. Список сотрудников (кроме меня) со статусом в сети
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, is_online, department, position, (id = $1) AS is_me FROM users WHERE registered = TRUE ORDER BY name`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка списка сотрудников:', err.message);
    res.status(500).json({ error: 'Не удалось получить список сотрудников' });
  }
});

// 2. Мои чаты. Для личного чата название - имя собеседника
router.get('/rooms', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.type,
         CASE WHEN r.type = 'direct'
           THEN (SELECT u.name FROM room_members m
                 JOIN users u ON u.id = m.user_id
                 WHERE m.room_id = r.id AND m.user_id <> $1
                 LIMIT 1)
           ELSE r.name
         END AS name
       FROM rooms r
       JOIN room_members me ON me.room_id = r.id AND me.user_id = $1
       ORDER BY (SELECT MAX(created_at) FROM messages WHERE room_id = r.id) DESC NULLS LAST,
                r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка списка чатов:', err.message);
    res.status(500).json({ error: 'Не удалось получить список чатов' });
  }
});

// 3. Открыть личный чат с сотрудником (если чата нет, создаём)
router.post('/rooms/direct', async (req, res) => {
  const otherId = Number(req.body.userId);

  if (!Number.isInteger(otherId) || otherId === req.user.id) {
    return res.status(400).json({ error: 'Выберите другого сотрудника' });
  }

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT r.id FROM rooms r
       JOIN room_members a ON a.room_id = r.id AND a.user_id = $1
       JOIN room_members b ON b.room_id = r.id AND b.user_id = $2
       WHERE r.type = 'direct'
       LIMIT 1`,
      [req.user.id, otherId]
    );
    if (existing.rowCount > 0) {
      return res.json({ id: existing.rows[0].id });
    }

    await client.query('BEGIN');
    const room = await client.query(
      `INSERT INTO rooms (type) VALUES ('direct') RETURNING id`
    );
    const roomId = room.rows[0].id;
    await client.query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [roomId, req.user.id, otherId]
    );
    await client.query('COMMIT');

    res.json({ id: roomId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка личного чата:', err.message);
    res.status(500).json({ error: 'Не удалось открыть чат' });
  } finally {
    client.release();
  }
});

// 4. Создать групповой чат (канал или отдел)
router.post('/rooms/group', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];

  if (!name) {
    return res.status(400).json({ error: 'Введите название чата' });
  }

  // Создатель всегда входит в чат, дубликаты убираем
  const ids = [...new Set([req.user.id, ...memberIds.map(Number)])]
    .filter((id) => Number.isInteger(id));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const room = await client.query(
      `INSERT INTO rooms (name, type) VALUES ($1, 'group') RETURNING id`,
      [name]
    );
    const roomId = room.rows[0].id;
    for (const id of ids) {
      await client.query(
        `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)`,
        [roomId, id]
      );
    }
    await client.query('COMMIT');

    res.json({ id: roomId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Ошибка группового чата:', err.message);
    res.status(500).json({ error: 'Не удалось создать чат' });
  } finally {
    client.release();
  }
});

// 5. История сообщений чата (последние 100). Только для участников чата
router.get('/rooms/:id/messages', async (req, res) => {
  try {
    const roomId = Number(req.params.id);

    const member = await pool.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, req.user.id]
    );
    if (member.rowCount === 0) {
      return res.status(403).json({ error: 'Это не ваш чат' });
    }

    const result = await pool.query(
      `SELECT m.id, m.room_id, m.user_id, u.name AS user_name,
              m.text, m.image_url, m.created_at
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.room_id = $1
       ORDER BY m.id DESC
       LIMIT 100`,
      [roomId]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error('Ошибка истории:', err.message);
    res.status(500).json({ error: 'Не удалось получить сообщения' });
  }
});

module.exports = router;