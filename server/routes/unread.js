const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Доступно только вошедшим сотрудникам
router.use(requireAuth);

// Мои чаты с числом непрочитанных. Новые сообщения поднимают чат наверх
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
         END AS name,
         (SELECT COUNT(*)::int FROM messages msg
          WHERE msg.room_id = r.id
            AND msg.id > me.last_read_message_id
            AND msg.user_id <> $1) AS unread
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

// Отметить чат прочитанным до последнего сообщения
router.post('/rooms/:id/read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE room_members
       SET last_read_message_id = COALESCE(
         (SELECT MAX(id) FROM messages WHERE room_id = $1), 0)
       WHERE room_id = $1 AND user_id = $2`,
      [Number(req.params.id), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка отметки прочитанного:', err.message);
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

module.exports = router;