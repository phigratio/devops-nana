const form = document.getElementById('profileForm');
const listEl = document.getElementById('userList');
const listEmpty = document.getElementById('listEmpty');
const searchEl = document.getElementById('search');
const statusEl = document.getElementById('status');
const avatarEl = document.getElementById('avatar');
const headingEl = document.getElementById('formHeading');
const recordMetaEl = document.getElementById('recordMeta');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const revertBtn = document.getElementById('revertBtn');
const newBtn = document.getElementById('newBtn');

const FALLBACK_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
      '<rect width="96" height="96" fill="#c4c8d0"/>' +
      '<text x="48" y="60" font-size="34" text-anchor="middle" fill="#6b7280">?</text>' +
    '</svg>'
  );

const EMPTY = { name: '', title: '', email: '', location: '', bio: '', avatarUrl: '' };

let users = [];
let selectedId = null; // null means "creating a new user"
let editing = { ...EMPTY };
let statusTimer = null;

avatarEl.addEventListener('error', () => {
  if (avatarEl.src !== FALLBACK_AVATAR) avatarEl.src = FALLBACK_AVATAR;
});

function setStatus(message, kind) {
  clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
  if (message) statusTimer = setTimeout(() => setStatus(''), 3500);
}

async function api(url, options) {
  const res = await fetch(url, options);
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body;
}

function formValues() {
  return Object.fromEntries(new FormData(form).entries());
}

function fillForm(user) {
  editing = { ...EMPTY, ...user };

  for (const el of form.elements) {
    if (el.name) el.value = editing[el.name] || '';
  }

  avatarEl.src = editing.avatarUrl || FALLBACK_AVATAR;
  avatarEl.alt = editing.name ? editing.name + "'s profile picture" : 'Profile picture';

  const isNew = !editing.id;
  headingEl.textContent = isNew ? 'New user' : editing.name || 'Unnamed';
  deleteBtn.hidden = isNew;
  saveBtn.textContent = isNew ? 'Create' : 'Save';

  recordMetaEl.textContent = isNew
    ? 'Will be inserted into the users collection'
    : `id ${editing.id}` +
      (editing.updatedAt ? ' · updated ' + new Date(editing.updatedAt).toLocaleString() : '');
}

function select(id) {
  selectedId = id;
  fillForm(id ? users.find((u) => u.id === id) || EMPTY : EMPTY);
  renderList();
}

function renderList() {
  listEl.replaceChildren();

  for (const user of users) {
    const li = document.createElement('li');
    li.className = 'user-item' + (user.id === selectedId ? ' active' : '');

    const img = document.createElement('img');
    img.src = user.avatarUrl || FALLBACK_AVATAR;
    img.alt = '';
    img.addEventListener('error', () => { img.src = FALLBACK_AVATAR; });

    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = user.name || 'Unnamed';
    const sub = document.createElement('span');
    sub.className = 'muted small';
    sub.textContent = user.title || user.email || '';
    text.append(name, document.createElement('br'), sub);

    li.append(img, text);
    li.addEventListener('click', () => select(user.id));
    listEl.append(li);
  }

  listEmpty.hidden = users.length > 0;
}

async function loadUsers(query) {
  const url = '/api/users' + (query ? '?q=' + encodeURIComponent(query) : '');
  users = await api(url);
  renderList();
}

form.addEventListener('input', (event) => {
  if (event.target.name === 'avatarUrl') {
    avatarEl.src = event.target.value.trim() || FALLBACK_AVATAR;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = formValues();
  if (!payload.name.trim()) {
    setStatus('Name is required', 'err');
    return;
  }

  saveBtn.disabled = true;
  setStatus('Saving…');

  try {
    const saved = selectedId
      ? await api('/api/users/' + selectedId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await api('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    await loadUsers(searchEl.value.trim());
    select(saved.id);
    setStatus(selectedId ? 'Saved' : 'Created', 'ok');
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!selectedId) return;
  if (!confirm(`Delete ${editing.name || 'this user'}? This cannot be undone.`)) return;

  deleteBtn.disabled = true;

  try {
    await api('/api/users/' + selectedId, { method: 'DELETE' });
    await loadUsers(searchEl.value.trim());
    select(users.length ? users[0].id : null);
    setStatus('Deleted', 'ok');
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    deleteBtn.disabled = false;
  }
});

revertBtn.addEventListener('click', () => {
  select(selectedId);
  setStatus('');
});

newBtn.addEventListener('click', () => {
  select(null);
  form.elements.name.focus();
});

let searchTimer = null;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      await loadUsers(searchEl.value.trim());
    } catch (err) {
      setStatus(err.message, 'err');
    }
  }, 250);
});

(async function init() {
  try {
    await loadUsers();
    select(users.length ? users[0].id : null);
  } catch (err) {
    setStatus('Could not load users — is the server running?', 'err');
  }
})();
