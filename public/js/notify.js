// Непрочитанные сообщения, уведомления и звук

const BASE_TITLE = document.title;

// Просим разрешение на уведомления при первом клике по странице
document.addEventListener(
  'click',
  () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },
  { once: true }
);

// Короткий звуковой сигнал
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

// Список чатов с кружком непрочитанных
renderRooms = function () {
  roomsList.innerHTML = '';
  let total = 0;

  rooms.forEach((r) => {
    const name = r.name || 'Чат';
    const li = createItem(
      name,
      r.type === 'group' ? 'Группа' : 'Личный чат',
      createAvatar(name, false),
      () => openRoom(r.id, name),
      r.id === currentRoomId
    );

    if (r.unread > 0) {
      total += r.unread;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = r.unread > 99 ? '99+' : r.unread;
      li.appendChild(badge);
    }
    roomsList.appendChild(li);
  });

  document.title = total > 0 ? '(' + total + ') ' + BASE_TITLE : BASE_TITLE;
};

// Отметить чат прочитанным и обновить список
async function markRead(roomId) {
  await api('POST', '/api/chat/rooms/' + roomId + '/read');
  await loadRooms();
}

// При открытии чата отмечаем его прочитанным
const originalOpenRoom = openRoom;
openRoom = async function (id, title) {
  await originalOpenRoom(id, title);
  markRead(id);
};

// Пришло новое сообщение от другого человека
socket.on('new-message', (m) => {
  if (!me || m.user_id === me.id) return;

  const looking = m.room_id === currentRoomId && document.visibilityState === 'visible';
  if (looking) {
    markRead(m.room_id);
    return;
  }

  beep();
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(m.user_name, { body: m.text || 'Картинка' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }
});

// Вернулись на вкладку: открытый чат считаем прочитанным
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentRoomId) markRead(currentRoomId);
});