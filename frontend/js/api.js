function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )(?:__Host-)?' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function apiPost(path, body) {
  const csrfToken = getCookie('marquee_csrf');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(body || {}),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

async function apiGet(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

async function apiDelete(path) {
  const csrfToken = getCookie('marquee_csrf');
  const res = await fetch(path, {
    method: 'DELETE',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}
