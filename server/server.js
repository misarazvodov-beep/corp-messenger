require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { checkConnection } = require('./db');
const setupChat = require('./sockets/chat');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Чтобы сервер понимал данные в формате JSON
app.use(express.json());

// Вход по коду и работа с чатами
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/rooms'));

// Отдаём страницы из папки public
app.use(express.static(path.join(__dirname, '..', 'public')));

// Отдаём загруженные картинки
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Проверка, что сервер жив
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Сообщения и статусы "в сети" в реальном времени
setupChat(io);

server.listen(PORT, async () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);

  try {
    await checkConnection();
  } catch (err) {
    console.error('Не удалось подключиться к базе данных:', err.message);
  }
});