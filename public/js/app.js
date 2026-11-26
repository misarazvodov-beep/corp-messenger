// Соединение с сервером начинается только после входа (нужен пропуск)
const socket = io({ autoConnect: false });

const $ = (id) => document.getElementById(id);

const statusEl = $('status');
const messageEl = $('message');
const loginBox = $('login-box');
const chatApp = $('chat-app');
const stepEmail = $('step-email');
const stepCode = $('step-code');
const emailInput = $('email');
const codeInput = $('code');
const resendButton = $('btn-resend');
const roomsList = $('rooms-list');
const usersList = $('users-list');
const messagesEl = $('messages');
const messageInput = $('message-input');
const chatEmpty = $('chat-empty');
const chatRoom = $('chat-room');
const roomTitle = $('room-title');
const groupModal = $('group-modal');
const groupName = $('group-name');
const groupMembers = $('group-members');

let cooldownTimer = null;
let me = null;
let currentRoomId = null;
let rooms = [];
let users = [];

// ---------- Общие помощники ----------

function showMessage(text, isError) {
  messageEl.textContent = text;
  messageEl.className = isError ? 'error' : 'ok';
}

// Запрос к серверу. Если есть пропуск, прикладываем его
async function api(method, url, data) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = 'Bearer ' + token;

  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json().catch(() => ({}));

  if (response.status === 401 && token) logout();
  return { ok: response.ok, data: result };
}

// Проверка, что сервер доступен
fetch('/api/health')
  .then((r) => {
    if (!r.ok) throw new Error();
    statusEl.textContent = 'Сервер доступен';
    statusEl.className = 'ok';
  })
  .catch(() => {
    statusEl.textContent = 'Сервер недоступен';
    statusEl.className = 'error';
  });

// ---------- Вход по коду ----------

function startCooldown() {
  let seconds = 60;
  resendButton.disabled = true;
  resendButton.textContent = 'Отправить код ещё раз (' + seconds + ')';

  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(cooldownTimer);
      resendButton.disabled = false;
      resendButton.textContent = 'Отправить код ещё раз';
    } else {
      resendButton.textContent = 'Отправить код ещё раз (' + seconds + ')';
    }
  }, 1000);
}

function showLogin() {
  clearInterval(cooldownTimer);
  chatApp.classList.add('hidden');
  loginBox.classList.remove('hidden');
  stepCode.classList.add('hidden');
  stepEmail.classList.remove('hidden');
  codeInput.value = '';
  showMessage('', false);
}

async function requestCode(isResend) {
  const email = emailInput.value.trim();
  showMessage('Отправляем код...', false);

  const result = await api('POST', '/api/auth/request-code', { email });
  if (!result.ok) {
    showMessage(result.data.error, true);
    return;
  }

  stepEmail.classList.add('hidden');
  stepCode.classList.remove('hidden');
  showMessage(isResend ? 'Новый код отправлен.' : 'Код отправлен. Проверьте почту.', false);
  startCooldown();
}

$('btn-request').addEventListener('click', () => requestCode(false));
resendButton.addEventListener('click', () => requestCode(true));

$('btn-change-email').addEventListener('click', () => {
  clearInterval(cooldownTimer);
  stepCode.classList.add('hidden');
  stepEmail.classList.remove('hidden');
  codeInput.value = '';
  emailInput.focus();
  showMessage('', false);
});

$('btn-verify').addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const code = codeInput.value.trim();

  const result = await api('POST', '/api/auth/verify', { email, code });
  if (!result.ok) {
    showMessage(result.data.error, true);
    return;
  }

  localStorage.setItem('token', result.data.token);
  localStorage.setItem('user', JSON.stringify(result.data.user));
  showApp(result.data.user);
});

// ---------- Вход в мессенджер и выход ----------

function showApp(user) {
  me = user;
  loginBox.classList.add('hidden');
  chatApp.classList.remove('hidden');
  $('welcome-user').textContent = user.email;

  socket.auth = { token: localStorage.getItem('token') };
  if (!socket.connected) socket.connect();

  loadRooms();
  loadUsers();
}

function logout() {
  socket.disconnect();
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  me = null;
  currentRoomId = null;
  rooms = [];
  users = [];
  messagesEl.innerHTML = '';
  chatRoom.classList.add('hidden');
  chatEmpty.classList.remove('hidden');
  chatApp.classList.remove('show-chat');
  showLogin();
}

$('btn-logout').addEventListener('click', logout);

// ---------- Списки чатов и сотрудников ----------

const COLORS = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];

// Круглая аватарка с первой буквой имени
function createAvatar(name, isOnline) {
  const el = document.createElement('div');
  el.className = 'avatar';

  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  el.style.background = COLORS[sum % COLORS.length];
  el.textContent = (name[0] || '?').toUpperCase();

  if (isOnline) {
    const dot = document.createElement('span');
    dot.className = 'online-dot';
    el.appendChild(dot);
  }
  return el;
}

function createItem(name, sub, avatar, onClick, active) {
  const li = document.createElement('li');
  li.className = 'item' + (active ? ' active' : '');

  const info = document.createElement('div');
  info.className = 'item-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'item-name';
  nameEl.textContent = name;

  const subEl = document.createElement('div');
  subEl.className = 'item-sub';
  subEl.textContent = sub;

  info.appendChild(nameEl);
  info.appendChild(subEl);
  li.appendChild(avatar);
  li.appendChild(info);
  li.addEventListener('click', onClick);
  return li;
}

function renderRooms() {
  roomsList.innerHTML = '';
  rooms.forEach((r) => {
    const name = r.name || 'Чат';
    roomsList.appendChild(
      createItem(
        name,
        r.type === 'group' ? 'Группа' : 'Личный чат',
        createAvatar(name, false),
        () => openRoom(r.id, name),
        r.id === currentRoomId
      )
    );
  });
}

function renderUsers() {
  usersList.innerHTML = '';
  users.forEach((u) => {
    usersList.appendChild(
      createItem(
        u.name,
        u.is_online ? 'в сети' : 'не в сети',
        createAvatar(u.name, u.is_online),
        () => openDirect(u),
        false
      )
    );
  });
}

async function loadRooms() {
  const result = await api('GET', '/api/chat/rooms');
  if (result.ok) {
    rooms = result.data;
    renderRooms();
  }
}

async function loadUsers() {
  const result = await api('GET', '/api/chat/users');
  if (result.ok) {
    users = result.data;
    renderUsers();
  }
}

// ---------- Переписка ----------

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(m) {
  const own = me && m.user_id === me.id;

  const box = document.createElement('div');
  box.className = 'msg' + (own ? ' own' : '');

  if (!own) {
    const author = document.createElement('div');
    author.className = 'msg-author';
    author.textContent = m.user_name;
    box.appendChild(author);
  }

  if (m.image_url && m.image_url.startsWith('/uploads/')) {
    const img = document.createElement('img');
    img.className = 'msg-img';
    img.src = m.image_url;
    box.appendChild(img);
  }

  if (m.text) {
    const text = document.createElement('div');
    text.className = 'msg-text';
    text.textContent = m.text;
    box.appendChild(text);
  }

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = new Date(m.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  box.appendChild(time);

  messagesEl.appendChild(box);
}

async function openRoom(id, title) {
  currentRoomId = id;
  roomTitle.textContent = title;
  chatEmpty.classList.add('hidden');
  chatRoom.classList.remove('hidden');
  chatApp.classList.add('show-chat');
  renderRooms();

  messagesEl.innerHTML = '';
  const result = await api('GET', '/api/chat/rooms/' + id + '/messages');
  if (result.ok) {
    result.data.forEach(addMessage);
    scrollToBottom();
  }
  messageInput.focus();
}

// Открыть личный чат с сотрудником (если чата нет, сервер его создаст)
async function openDirect(user) {
  const result = await api('POST', '/api/chat/rooms/direct', { userId: user.id });
  if (!result.ok) {
    alert(result.data.error || 'Не удалось открыть чат');
    return;
  }
  await loadRooms();
  openRoom(result.data.id, user.name);
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentRoomId) return;

  socket.emit('send-message', { roomId: currentRoomId, text }, (reply) => {
    if (reply && reply.error) {
      alert(reply.error);
      return;
    }
    messageInput.value = '';
  });
}

$('btn-send').addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Кнопка "Назад" на телефоне
$('btn-back').addEventListener('click', () => {
  chatApp.classList.remove('show-chat');
});

// ---------- Групповой чат ----------

$('btn-new-group').addEventListener('click', () => {
  groupName.value = '';
  groupMembers.innerHTML = '';

  users.forEach((u) => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = u.id;
    label.appendChild(box);
    label.appendChild(document.createTextNode(u.name));
    groupMembers.appendChild(label);
  });

  groupModal.classList.remove('hidden');
});

$('btn-group-cancel').addEventListener('click', () => {
  groupModal.classList.add('hidden');
});

$('btn-group-create').addEventListener('click', async () => {
  const name = groupName.value.trim();
  const memberIds = [...groupMembers.querySelectorAll('input:checked')].map((i) => Number(i.value));

  const result = await api('POST', '/api/chat/rooms/group', { name, memberIds });
  if (!result.ok) {
    alert(result.data.error || 'Не удалось создать группу');
    return;
  }

  groupModal.classList.add('hidden');
  await loadRooms();
  openRoom(result.data.id, name);
});

// ---------- События от сервера в реальном времени ----------

// Пропуск не подошёл: возвращаем на экран входа
socket.on('connect_error', (err) => {
  if (err.message === 'Нужно войти') logout();
});

// Пришло новое сообщение
socket.on('new-message', async (m) => {
  if (m.room_id === currentRoomId) {
    addMessage(m);
    scrollToBottom();
  }
  await loadRooms();
});

// Кто-то вошёл в сеть или вышел
socket.on('presence', ({ userId, isOnline }) => {
  const user = users.find((u) => u.id === userId);
  if (user) {
    user.is_online = isOnline;
    renderUsers();
  } else if (me && userId !== me.id) {
    loadUsers();
  }
});

// ---------- Старт страницы ----------

// Если человек уже входил раньше, сразу пускаем
const savedUser = localStorage.getItem('user');
if (localStorage.getItem('token') && savedUser) {
  showApp(JSON.parse(savedUser));
}