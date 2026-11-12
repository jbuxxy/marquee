document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    await apiPost('/admin/api/login', { password });
    document.getElementById('login-section').hidden = true;
    document.getElementById('setup-section').hidden = false;
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

function formToNested(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.value === '') continue;
    const parts = el.name.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = el.value;
  }
  return out;
}

document.getElementById('setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('setup-error');
  const statusEl = document.getElementById('setup-status');
  errorEl.textContent = '';
  statusEl.textContent = '';
  try {
    const body = formToNested(e.target);
    const result = await apiPost('/admin/api/settings', body);
    if (result.setupComplete) {
      statusEl.textContent = 'Setup complete — redirecting…';
      window.location.href = '/';
    } else {
      statusEl.textContent = 'Saved. Seerr, and at least one of Plex/Jellyfin, is still needed.';
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('setup-form').addEventListener('click', async (e) => {
  const btn = e.target.closest('.test-btn');
  if (!btn) return;
  const serviceKey = btn.dataset.test;
  const fieldset = btn.closest('fieldset');
  const body = {};
  fieldset.querySelectorAll('input').forEach((input) => {
    const field = input.name.split('.').pop();
    if (input.value) body[field] = input.value;
  });

  const resultEl = document.getElementById(`test-result-${serviceKey}`);
  resultEl.textContent = 'Testing…';
  resultEl.className = 'test-result';
  try {
    const result = await apiPost(`/admin/api/test/${serviceKey}`, body);
    resultEl.textContent = result.ok ? 'Connected' : `Failed${result.error ? `: ${result.error}` : ''}`;
    resultEl.className = `test-result ${result.ok ? 'ok' : 'fail'}`;
  } catch (err) {
    resultEl.textContent = err.message;
    resultEl.className = 'test-result fail';
  }
});
