require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { checkConnection } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Чтобы сервер понимал данные в формате JSON
app.use(express.json());
app.use('/api/auth', require('./routes/auth'));

// Отдаём страницы из папки public
app.use(express.static(path.join(__dirname, '..', 'public')));

// Отдаём загруженные картинки
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Проверка, что сервер жив
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Пока просто фиксируем подключения и отключения
io.on('connection', (socket) => {
  console.log('Подключился клиент:', socket.id);

  socket.emit('welcome', 'Сервер на связи!');

  socket.on('disconnect', () => {
    console.log('Клиент отключился:', socket.id);
  });
});

server.listen(PORT, async () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);

  try {
    await checkConnection();
  } catch (err) {
    console.error('Не удалось подключиться к базе данных:', err.message);
  }
});