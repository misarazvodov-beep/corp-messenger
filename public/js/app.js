const socket = io({ autoConnect: false });
const $ = (id) => document.getElementById(id);

const SCREENS = ['login-box', 'register-box', 'forgot-box', 'change-box', 'chat-app'];

const roomsList = $('rooms-list');
const usersList = $('users-list');
const messagesEl = $('messages');
const messageInput = $('message-input');
const chatEmpty = $('chat-empty');
const chatRoom = $('chat-room');
const chatApp = $('chat-app');
const roomTitle = $('room-title');
const groupModal = $('group-modal');
const groupName = $('group-name');
const groupMembers = $('group-members');

let me = null;
let currentRoomId = null;
let rooms = [];
let users = [];
let registrationToken = null;
let cooldownTimer = null;

// ---------- Общие помощники ----------

function showScreen(id) {
  SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== id));
}

function setMsg(id, text, isError) {
  const el = $(id);
  el.textContent = text;
  el.className = isError ? 'error' : 'ok';
}

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

fetch('/api/health')
  .then((r) => {
    if (!r.ok) throw new Error();
    $('status').textContent = 'Сервер доступен';
    $('status').className = 'ok';
  })
  .catch(() => {
    $('status').textContent = 'Сервер недоступен';
    $('status').className = 'error';
  });

// ---------- Вход ----------

$('btn-login').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;

  const result = await api('POST', '/api/auth/login', { email, password });
  if (!result.ok) return setMsg('login-message', result.data.error, true);

  localStorage.setItem('token', result.data.token);
  localStorage.setItem('user', JSON.stringify(result.data.user));
  me = result.data.user;
  $('login-password').value = '';

  if (result.data.mustChangePassword) {
    localStorage.setItem('mustChange', '1');
    setMsg('login-message', '', false);
    showScreen('change-box');
  } else {
    showApp(me);
  }
});

$('btn-go-register').addEventListener('click', () => {
  setMsg('reg-message', '', false);
  showScreen('register-box');
});
$('btn-go-forgot').addEventListener('click', () => {
  openForgotMenu();
  showScreen('forgot-box');
});

// ---------- Регистрация ----------

function startCooldown() {
  const button = $('btn-reg-resend');
  let seconds = 60;
  button.disabled = true;
  button.textContent = 'Отправить код ещё раз (' + seconds + ')';

  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(cooldownTimer);
      button.disabled = false;
      button.textContent = 'Отправить код ещё раз';
    } else {
      button.textContent = 'Отправить код ещё раз (' + seconds + ')';
    }
  }, 1000);
}

async function requestCode(isResend) {
  setMsg('reg-message', 'Отправляем код...', false);
  const result = await api('POST', '/api/auth/request-code', {
    email: $('reg-email').value.trim(),
  });
  if (!result.ok) return setMsg('reg-message', result.data.error, true);

  $('reg-step-email').classList.add('hidden');
  $('reg-step-code').classList.remove('hidden');
  setMsg('reg-message', isResend ? 'Новый код отправлен.' : 'Код отправлен. Проверьте почту.', false);
  startCooldown();
}

$('btn-reg-request').addEventListener('click', () => requestCode(false));
$('btn-reg-resend').addEventListener('click', () => requestCode(true));

$('btn-reg-change-email').addEventListener('click', () => {
  clearInterval(cooldownTimer);
  $('reg-step-code').classList.add('hidden');
  $('reg-step-email').classList.remove('hidden');
  $('reg-code').value = '';
  setMsg('reg-message', '', false);
});

$('btn-reg-verify').addEventListener('click', async () => {
  const result = await api('POST', '/api/auth/verify-email', {
    email: $('reg-email').value.trim(),
    code: $('reg-code').value.trim(),
  });
  if (!result.ok) return setMsg('reg-message', result.data.error, true);

  registrationToken = result.data.registrationToken;
  clearInterval(cooldownTimer);
  $('reg-step-code').classList.add('hidden');
  $('reg-step-profile').classList.remove('hidden');
  setMsg('reg-message', '', false);
});

$('btn-reg-finish').addEventListener('click', async () => {
  const password = $('reg-password').value;
  if (password !== $('reg-password2').value) {
    return setMsg('reg-message', 'Пароли не совпадают', true);
  }

  const result = await api('POST', '/api/auth/register', {
    registrationToken,
    nickname: $('reg-nickname').value.trim(),
    password,
  });
  if (!result.ok) return setMsg('reg-message', result.data.error, true);

  localStorage.setItem('token', result.data.token);
  localStorage.setItem('user', JSON.stringify(result.data.user));
  showApp(result.data.user);
});

$('btn-reg-back').addEventListener('click', () => {
  clearInterval(cooldownTimer);
  $('reg-step-email').classList.remove('hidden');
  $('reg-step-code').classList.add('hidden');
  $('reg-step-profile').classList.add('hidden');
  showScreen('login-box');
});

// ---------- Забыли логин или пароль ----------

function openForgotMenu() {
  $('forgot-menu').classList.remove('hidden');
  $('forgot-login-info').classList.add('hidden');
  $('forgot-password-form').classList.add('hidden');
  setMsg('forgot-message', '', false);
}

$('btn-forgot-login').addEventListener('click', () => {
  $('forgot-menu').classList.add('hidden');
  $('forgot-login-info').classList.remove('hidden');
});
$('btn-forgot-password').addEventListener('click', () => {
  $('forgot-menu').classList.add('hidden');
  $('forgot-password-form').classList.remove('hidden');
});
$('btn-forgot-login-back').addEventListener('click', openForgotMenu);
$('btn-forgot-password-back').addEventListener('click', openForgotMenu);
$('btn-forgot-back').addEventListener('click', () => showScreen('login-box'));

$('btn-send-temp').addEventListener('click', async () => {
  const result = await api('POST', '/api/auth/forgot-password', {
    email: $('forgot-email').value.trim(),
  });
  if (!result.ok) return setMsg('forgot-message', result.data.error, true);
  setMsg('forgot-message', 'Если такая почта зарегистрирована, мы отправили на неё временный пароль.', false);
});

// ---------- Вход по временному паролю ----------

$('btn-keep-password').addEventListener('click', async () => {
  const result = await api('POST', '/api/auth/keep-password');
  if (!result.ok) return setMsg('change-message', result.data.error, true);
  localStorage.removeItem('mustChange');
  showApp(me);
});

$('btn-set-password').addEventListener('click', async () => {
  const result = await api('POST', '/api/auth/change-password', {
    newPassword: $('new-password').value,
  });
  if (!result.ok) return setMsg('change-message', result.data.error, true);
  localStorage.removeItem('mustChange');
  $('new-password').value = '';
  showApp(me);
});

// ---------- Вход в мессенджер и выход ----------

function showApp(user) {
  me = user;
  showScreen('chat-app');
  $('welcome-user').textContent = user.name || user.email;

  socket.auth = { token: localStorage.getItem('token') };
  if (!socket.connected) socket.connect();

  loadRooms();
  loadUsers();
}

function logout() {
  socket.disconnect();
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('mustChange');
  me = null;
  currentRoomId = null;
  rooms = [];
  users = [];
  messagesEl.innerHTML = '';
  chatRoom.classList.add('hidden');
  chatEmpty.classList.remove('hidden');
  chatApp.classList.remove('show-chat');
  showScreen('login-box');
}

$('btn-logout').addEventListener('click', logout);

// ---------- Списки чатов и сотрудников ----------

const COLORS = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];

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

socket.on('connect_error', (err) => {
  if (err.message === 'Нужно войти') logout();
});

socket.on('new-message', async (m) => {
  if (m.room_id === currentRoomId) {
    addMessage(m);
    scrollToBottom();
  }
  await loadRooms();
});

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

const savedUser = localStorage.getItem('user');
if (localStorage.getItem('token') && savedUser) {
  me = JSON.parse(savedUser);
  if (localStorage.getItem('mustChange')) showScreen('change-box');
  else showApp(me);
}