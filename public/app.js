const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'mf_token';

const subjectEl = $('subject');
const textEl = $('textBody');
const htmlEl = $('htmlBody');
const emailsBox = $('emailsBox');
const delayEl = $('delayMs');
const testToEl = $('testTo');
const preview = $('preview');
const textPreview = $('textPreview');
const textOnlyEl = $('textOnly');
const logEl = $('log');
const progressEl = $('progress');
const splitPreview = $('splitPreview');

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  return fetch(url, { credentials: 'include', ...options, headers });
}

function setStatus(el, msg, type = '') {
  el.textContent = msg;
  el.className = 'status' + (type ? ` ${type}` : '');
}

function log(msg) {
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function updatePreview() {
  if (textPreview) textPreview.textContent = textEl.value || '';
  if (preview) {
    preview.srcdoc = htmlEl.value
      ? htmlEl.value
      : `<pre style="padding:16px;font-family:Georgia,serif;white-space:pre-wrap;">${(textEl.value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`;
  }
}

function getAccounts() {
  return [...document.querySelectorAll('.account')]
    .map((box) => ({
      email: box.querySelector('.acc-email').value.trim(),
      appPassword: box.querySelector('.acc-pass').value.trim(),
      fromName: box.querySelector('.acc-from').value.trim() || 'Daniel',
    }))
    .filter((a) => a.email && a.appPassword);
}

function getEmailsFromBox() {
  return emailsBox.value
    .split(/\r?\n|,|;|\s+/)
    .map((e) => e.trim().toLowerCase().replace(/,+$/, ''))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function updateSplitPreview() {
  const emails = [...new Set(getEmailsFromBox())];
  const accounts = getAccounts();
  if (!emails.length || !accounts.length) {
    splitPreview.textContent = '';
    return;
  }
  const n = accounts.length;
  const base = Math.floor(emails.length / n);
  const rem = emails.length % n;
  const parts = accounts.map((a, i) => {
    const count = base + (i < rem ? 1 : 0);
    return `${a.email}: ~${count}`;
  });

  const sizes = Array.from({ length: n }, (_, i) => {
    let c = 0;
    for (let j = i; j < emails.length; j += n) c++;
    return c;
  });
  splitPreview.textContent =
    `Split plan (${emails.length} emails / ${n} accounts): ` +
    accounts.map((a, i) => `${a.email.split('@')[0]} → ${sizes[i]}`).join(' · ');
}

async function loadSavedAccounts() {
  try {
    const res = await api('/api/saved-accounts');
    const data = await res.json();
    if (!data.ok) return;

    const boxes = [...document.querySelectorAll('.account')];
    (data.accounts || []).forEach((acc, i) => {
      const box = boxes[i];
      if (!box) return;
      if (acc.email) box.querySelector('.acc-email').value = acc.email;
      if (acc.appPassword) box.querySelector('.acc-pass').value = acc.appPassword;
      if (acc.fromName) box.querySelector('.acc-from').value = acc.fromName;
    });

    if (data.fromEnv) {
      setStatus($('connStatus'), '.env se accounts load ho gaye', 'ok');
    }
    updateSplitPreview();
  } catch (_err) {

  }
}

async function loadDefaults() {
  const res = await api('/api/defaults');
  const data = await res.json();
  subjectEl.value = data.subject;
  textEl.value = data.text;
  htmlEl.value = data.html || '';
  if (textOnlyEl) textOnlyEl.checked = data.textOnly !== false;
  updatePreview();
  await loadSavedAccounts();
}

$('btnTest').addEventListener('click', async () => {
  const status = $('connStatus');
  const accounts = getAccounts();
  if (!accounts.length) {
    setStatus(status, 'Kam az kam 1 account bharo', 'bad');
    return;
  }
  setStatus(status, 'Checking...');
  try {
    const res = await api('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || data.message || 'Failed');
    const detail = (data.results || [])
      .map((r) => `${r.email}: ${r.ok ? 'OK' : 'FAIL'}`)
      .join(' | ');
    setStatus(status, `${data.message} — ${detail}`, 'ok');
    updateSplitPreview();
  } catch (err) {
    setStatus(status, err.message, 'bad');
  }
});

$('csvFile').addEventListener('change', () => {
  const file = $('csvFile').files[0];
  $('fileLabel').textContent = file ? file.name : 'Choose CSV / TXT file';
});

function extractEmailsFromText(raw) {
  const found = String(raw || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(found.map((e) => e.trim().toLowerCase().replace(/,+$/, '')))];
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

$('btnParse').addEventListener('click', async () => {
  const file = $('csvFile').files[0];
  const status = $('csvStatus');
  if (!file) {
    setStatus(status, 'Select a file first', 'bad');
    return;
  }
  setStatus(status, 'Parsing...');
  try {

    const text = await readFileAsText(file);
    let emails = extractEmailsFromText(text);

    if (!emails.length) {

      const fd = new FormData();
      fd.append('csv', file);
      const res = await api('/api/parse-csv', { method: 'POST', body: fd });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (_e) {
        throw new Error(
          /entity too large|request entity/i.test(raw)
            ? 'File too large for server. Use a smaller CSV or paste emails in the box.'
            : `Server error: ${raw.slice(0, 80)}`
        );
      }
      if (!data.ok) throw new Error(data.error || 'Parse failed');
      emails = data.emails || [];
    }

    if (!emails.length) throw new Error('No valid emails found in file');
    emailsBox.value = emails.join('\n');
    setStatus(status, `${emails.length} unique emails loaded`, 'ok');
    updateSplitPreview();
  } catch (err) {
    setStatus(status, err.message, 'bad');
  }
});

htmlEl.addEventListener('input', updatePreview);
textEl.addEventListener('input', updatePreview);
emailsBox.addEventListener('input', updateSplitPreview);
document.querySelectorAll('.acc-email, .acc-pass').forEach((el) => {
  el.addEventListener('input', updateSplitPreview);
});

async function sendEmails({ testOnly }) {
  const accounts = getAccounts();
  if (!accounts.length) {
    alert('Pehle kam az kam 1 Gmail + App Password dalo.');
    return;
  }

  const emails = getEmailsFromBox();
  const unique = [...new Set(emails)];
  emailsBox.value = unique.join('\n');
  updateSplitPreview();

  progressEl.classList.remove('hidden');
  progressEl.textContent = testOnly
    ? 'Sending test email...'
    : `Sending ${unique.length} emails via ${accounts.length} accounts...`;
  logEl.textContent = '';

  $('btnSendAll').disabled = true;
  $('btnTestSend').disabled = true;

  try {
    const res = await api('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accounts,
        subject: subjectEl.value.trim(),
        text: textEl.value,
        html: textOnlyEl?.checked ? '' : htmlEl.value,
        textOnly: textOnlyEl ? textOnlyEl.checked : true,
        emails: unique,
        delayMs: Number(delayEl.value) || 8000,
        testTo: testOnly ? testToEl.value.trim() : '',
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Send failed');

    progressEl.textContent = `Done: ${data.sent} sent, ${data.failed} failed (total ${data.total})`;

    if (data.splitPlan?.length) {
      log('SPLIT PLAN:');
      data.splitPlan.forEach((p) => log(`  ${p.email} → ${p.assigned} emails`));
      log('');
    }

    (data.results || []).forEach((r) => {
      if (r.ok) {
        log(`OK  ${r.to}  ← ${r.from}${r.failover ? ' (failover)' : ''}`);
      } else {
        log(`FAIL ${r.to} — ${r.error}`);
      }
    });
  } catch (err) {
    progressEl.textContent = 'Error';
    log('ERROR: ' + err.message);
  } finally {
    $('btnSendAll').disabled = false;
    $('btnTestSend').disabled = false;
  }
}

$('btnTestSend').addEventListener('click', () => {
  if (!testToEl.value.trim()) {
    alert('Test email address likho pehle.');
    return;
  }
  sendEmails({ testOnly: true });
});

$('btnSendAll').addEventListener('click', () => {
  const count = getEmailsFromBox().length;
  const accounts = getAccounts();
  if (!count) {
    alert('Pehle CSV load karo.');
    return;
  }
  if (!confirm(`Send to ${count} recipients using ${accounts.length} account(s)?`)) return;
  sendEmails({ testOnly: false });
});

async function unlockApp() {
  $('gate').hidden = true;
  $('app').hidden = false;
  await loadDefaults().catch((err) => log('Defaults load failed: ' + err.message));
}

function pinValue() {
  return [...document.querySelectorAll('#pin input')].map((el) => el.value).join('');
}

async function tryLogin(key) {
  $('gateErr').textContent = '';
  try {
    const res = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      $('gateErr').textContent = data.error || 'Invalid key';
      document.querySelectorAll('#pin input').forEach((el) => (el.value = ''));
      document.querySelector('#pin input')?.focus();
      return;
    }
    if (data.token) sessionStorage.setItem(TOKEN_KEY, data.token);
    await unlockApp();
  } catch (err) {
    $('gateErr').textContent = err.message || 'Login failed';
  }
}

function setupGate() {
  const inputs = [...document.querySelectorAll('#pin input')];
  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      if (pinValue().length === 4) tryLogin(pinValue());
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const key = pinValue();
        if (key.length === 4) tryLogin(key);
      }
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
    });
  });
  $('gateBtn')?.addEventListener('click', () => {
    const key = pinValue();
    if (key.length !== 4) {
      $('gateErr').textContent = 'Enter 4-digit key';
      return;
    }
    tryLogin(key);
  });
  inputs[0]?.focus();
}

(async () => {
  setupGate();
  try {
    const headers = {};
    const tok = getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const res = await api('/api/auth', { headers });
    const data = await res.json();
    if (data.ok) await unlockApp();
  } catch (_e) {}
})();
