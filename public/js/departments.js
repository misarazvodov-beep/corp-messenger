// Блок "Отделы": нажимаем на отдел и видим его сотрудников по алфавиту

const DEPARTMENTS = [
  'HR',
  'QA',
  'Разработка',
  'Бухгалтерия',
  'Финансовый отдел',
  'Отдел продаж',
  'Маркетинговый отдел',
];

const openDepartments = new Set();

// Оформление блока
const depStyle = document.createElement('style');
depStyle.textContent =
  '.dep-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;font-weight:bold;border-bottom:1px solid #e6e9ed}' +
  '.dep-head:hover{background:#f4f6f8}' +
  '.dep-count{font-weight:normal;color:#8a949e;font-size:13px}' +
  '.dep-empty{padding:8px 16px 8px 30px;color:#8a949e;font-size:13px}';
document.head.appendChild(depStyle);

renderUsers = function () {
  usersList.innerHTML = '';

  DEPARTMENTS.forEach((dep) => {
    const members = users
      .filter((u) => u.department === dep)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const isOpen = openDepartments.has(dep);

    const head = document.createElement('li');
    head.className = 'dep-head';

    const title = document.createElement('span');
    title.textContent = (isOpen ? '▾ ' : '▸ ') + dep;

    const count = document.createElement('span');
    count.className = 'dep-count';
    count.textContent = members.length;

    head.appendChild(title);
    head.appendChild(count);
    head.addEventListener('click', () => {
      if (isOpen) openDepartments.delete(dep);
      else openDepartments.add(dep);
      renderUsers();
    });
    usersList.appendChild(head);

    if (!isOpen) return;

    if (members.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'dep-empty';
      empty.textContent = 'В отделе пока никого';
      usersList.appendChild(empty);
    }

    members.forEach((u) => {
      const sub = (u.position || '') + (u.is_me ? ' (вы)' : '');
      usersList.appendChild(
        createItem(
          u.name,
          sub,
          createAvatar(u.name, u.is_online),
          u.is_me ? () => {} : () => openDirect(u),
          false
        )
      );
    });
  });
};

if (typeof users !== 'undefined' && users.length) renderUsers();