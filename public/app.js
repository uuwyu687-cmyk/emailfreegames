const $ = (id) => document.getElementById(id);

const subjectEl = $('subject');
const textEl = $('textBody');
const htmlEl = $('htmlBody');
const emailsBox = $('emailsBox');
const delayEl = $('delayMs');
const testToEl = $('testTo');
const preview = $('preview');
const logEl = $('log');
const progressEl = $('progress');
const splitPreview = $('splitPreview');

function setStatus(el, msg, type = '') {
  el.textContent = msg;
  el.className = 'status' + (type ? ` ${type}` : '');
}

function log(msg) {
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function updatePreview() {
  preview.srcdoc = htmlEl.value || '<p style="padding:16px;font-family:sans-serif;color:#666;">No HTML</p>';
}

function getAccounts() {
  return [...document.querySelectorAll('.account')]
    .map((box) => ({
      email: box.querySelector('.acc-email').value.trim(),
      appPassword: box.querySelector('.acc-pass').value.trim(),
      fromName: box.querySelector('.acc-from').value.trim() || 'Bonus Offer',
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
  // round-robin split means nearly equal; show equal-ish
  const sizes = Array.from({ length: n }, (_, i) => {
    let c = 0;
    for (let j = i; j < emails.length; j += n) c++;
    return c;
  });
  splitPreview.textContent =
    `Split plan (${emails.length} emails / ${n} accounts): ` +
    accounts.map((a, i) => `${a.email.split('@')[0]} → ${sizes[i]}`).join(' · ');
}

async function loadDefaults() {
  const res = await fetch('/api/defaults');
  const data = await res.json();
  subjectEl.value = data.subject;
  textEl.value = data.text;
  htmlEl.value = data.html;
  updatePreview();
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
    const res = await fetch('/api/test-connection', {
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

$('btnParse').addEventListener('click', async () => {
  const file = $('csvFile').files[0];
  const status = $('csvStatus');
  if (!file) {
    setStatus(status, 'Select a file first', 'bad');
    return;
  }
  setStatus(status, 'Parsing...');
  try {
    const fd = new FormData();
    fd.append('csv', file);
    const res = await fetch('/api/parse-csv', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Parse failed');
    emailsBox.value = data.emails.join('\n');
    setStatus(status, `${data.count} unique emails loaded`, 'ok');
    updateSplitPreview();
  } catch (err) {
    setStatus(status, err.message, 'bad');
  }
});

htmlEl.addEventListener('input', updatePreview);
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
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accounts,
        subject: subjectEl.value.trim(),
        text: textEl.value,
        html: htmlEl.value,
        emails: unique,
        delayMs: Number(delayEl.value) || 2500,
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

loadDefaults().catch((err) => {
  log('Defaults load failed: ' + err.message);
});
