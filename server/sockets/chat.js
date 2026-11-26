const jwt = require('jsonwebtoken');
const { pool } = require('../db');

function setupChat(io) {
  // При запуске сервера все считаются "не в сети"
  pool.query('UPDATE users SET is_online = FALSE').catch((err) => {
    console.error('Ошибка сброса статусов:', err.message);
  });

  // Проверяем пропуск у каждого, кто подключается
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch (err) {
      next(new Error('Нужно войти'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log('Подключился сотрудник:', socket.user.email);

    // Личная "комната" сотрудника: по ней можно написать ему на любом устройстве
    socket.join('user:' + userId);

    try {
      // Заходим во все свои чаты
      const rooms = await pool.query(
        'SELECT room_id FROM room_members WHERE user_id = $1',
        [userId]
      );
      rooms.rows.forEach((r) => socket.join('room:' + r.room_id));

      // Отмечаем "в сети" и сообщаем остальным
      await pool.query('UPDATE users SET is_online = TRUE WHERE id = $1', [userId]);
      io.emit('presence', { userId, isOnline: true });
    } catch (err) {
      console.error('Ошибка при подключении:', err.message);
    }

    // Отправка сообщения
    socket.on('send-message', async (data, callback) => {
      const reply = typeof callback === 'function' ? callback : () => {};

      try {
        const roomId = Number(data && data.roomId);
        const text = String((data && data.text) || '').trim().slice(0, 2000);
        const imageUrl = data && data.imageUrl ? String(data.imageUrl) : null;

        if (!Number.isInteger(roomId) || (!text && !imageUrl)) {
          return reply({ error: 'Пустое сообщение' });
        }
        if (imageUrl && !imageUrl.startsWith('/uploads/')) {
          return reply({ error: 'Неверная картинка' });
        }

        // Писать можно только в свои чаты
        const member = await pool.query(
          'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
          [roomId, userId]
        );
        if (member.rowCount === 0) {
          return reply({ error: 'Это не ваш чат' });
        }

        const saved = await pool.query(
          `INSERT INTO messages (room_id, user_id, text, image_url)
           VALUES ($1, $2, $3, $4)
           RETURNING id, created_at`,
          [roomId, userId, text || null, imageUrl]
        );
        const author = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);

        const message = {
          id: saved.rows[0].id,
          room_id: roomId,
          user_id: userId,
          user_name: author.rows[0].name,
          text: text || null,
          image_url: imageUrl,
          created_at: saved.rows[0].created_at,
        };

        // Всех участников подключаем к комнате (вдруг чат только что создан)
        const members = await pool.query(
          'SELECT user_id FROM room_members WHERE room_id = $1',
          [roomId]
        );
        members.rows.forEach((m) => {
          io.in('user:' + m.user_id).socketsJoin('room:' + roomId);
        });

        io.to('room:' + roomId).emit('new-message', message);
        reply({ ok: true });
      } catch (err) {
        console.error('Ошибка отправки сообщения:', err.message);
        reply({ error: 'Не удалось отправить сообщение' });
      }
    });

    // Сотрудник отключился
    socket.on('disconnect', async () => {
      try {
        // Если у него остались открытые вкладки, он всё ещё в сети
        const left = await io.in('user:' + userId).fetchSockets();
        if (left.length === 0) {
          await pool.query(
            'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1',
            [userId]
          );
          io.emit('presence', { userId, isOnline: false });
        }
      } catch (err) {
        console.error('Ошибка при отключении:', err.message);
      }
    });
  });
}

module.exports = setupChat;