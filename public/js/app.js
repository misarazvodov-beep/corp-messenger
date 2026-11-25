const socket = io();
const statusEl = document.getElementById('status');

socket.on('connect', () => {
  statusEl.textContent = 'Соединение с сервером установлено';
  statusEl.className = 'ok';
});

socket.on('welcome', (text) => {
  console.log(text);
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Соединение потеряно';
  statusEl.className = 'error';
});