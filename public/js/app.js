const socket = io();

const statusEl = document.getElementById('status');
const messageEl = document.getElementById('message');
const loginBox = document.getElementById('login-box');
const chatBox = document.getElementById('chat-box');
const stepEmail = document.getElementById('step-email');
const stepCode = document.getElementById('step-code');
const emailInput = document.getElementById('email');
const codeInput = document.getElementById('code');
const welcomeUser = document.getElementById('welcome-user');
const resendButton = document.getElementById('btn-resend');

// Таймер для кнопки "Отправить код ещё раз"
let cooldownTimer = null;

// Статус соединения с сервером
socket.on('connect', () => {
  statusEl.textContent = 'Соединение с сервером установлено';
  statusEl.className = 'ok';
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Соединение потеряно';
  statusEl.className = 'error';
});

// Показать сообщение под формой
function showMessage(text, isError) {
  messageEl.textContent = text;
  messageEl.className = isError ? 'error' : 'ok';
}

// Отправить запрос на сервер и получить ответ
async function post(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return { ok: response.ok, data: result };
}

// Блокируем кнопку "Отправить код ещё раз" на 60 секунд
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

// Показать экран "Вы вошли"
function showChat(user) {
  loginBox.classList.add('hidden');
  chatBox.classList.remove('hidden');
  welcomeUser.textContent = 'Вы вошли как ' + user.email;
}

// Показать экран входа с самого начала
function showLogin() {
  clearInterval(cooldownTimer);
  chatBox.classList.add('hidden');
  loginBox.classList.remove('hidden');
  stepCode.classList.add('hidden');
  stepEmail.classList.remove('hidden');
  codeInput.value = '';
  showMessage('', false);
}

// Запросить код на почту. Используется и для первой отправки, и для повторной
async function requestCode(isResend) {
  const email = emailInput.value.trim();
  showMessage('Отправляем код...', false);

  const result = await post('/api/auth/request-code', { email });
  if (!result.ok) {
    showMessage(result.data.error, true);
    return;
  }

  stepEmail.classList.add('hidden');
  stepCode.classList.remove('hidden');
  showMessage(isResend ? 'Новый код отправлен.' : 'Код отправлен. Проверьте почту.', false);
  startCooldown();
}

// Кнопка "Получить код"
document.getElementById('btn-request').addEventListener('click', () => requestCode(false));

// Кнопка "Отправить код ещё раз"
resendButton.addEventListener('click', () => requestCode(true));

// Кнопка "Указать другую почту"
document.getElementById('btn-change-email').addEventListener('click', () => {
  clearInterval(cooldownTimer);
  stepCode.classList.add('hidden');
  stepEmail.classList.remove('hidden');
  codeInput.value = '';
  emailInput.focus();
  showMessage('', false);
});

// Кнопка "Войти"
document.getElementById('btn-verify').addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const code = codeInput.value.trim();

  const result = await post('/api/auth/verify', { email, code });
  if (!result.ok) {
    showMessage(result.data.error, true);
    return;
  }

  // Запоминаем "пропуск" в браузере
  localStorage.setItem('token', result.data.token);
  localStorage.setItem('user', JSON.stringify(result.data.user));
  showChat(result.data.user);
});

// Кнопка "Выйти"
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showLogin();
});

// Если человек уже входил раньше, сразу пускаем
const savedUser = localStorage.getItem('user');
if (localStorage.getItem('token') && savedUser) {
  showChat(JSON.parse(savedUser));
}