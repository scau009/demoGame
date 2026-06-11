async function apiGet(path) {
  const res = await fetch(path);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function getClientId() {
  let id = localStorage.getItem('client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('client_id', id);
  }
  return id;
}

function getNickname() {
  return localStorage.getItem('nickname') || '';
}

function setNickname(name) {
  localStorage.setItem('nickname', name);
}

function getToken() {
  return localStorage.getItem('admin_token') || '';
}

function setToken(t) {
  localStorage.setItem('admin_token', t);
}

function clearToken() {
  localStorage.removeItem('admin_token');
}
