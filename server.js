require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getEnvAccounts() {
  return [1, 2, 3]
    .map((n) => ({
      id: n,
      email: String(process.env[`EMAIL_${n}`] || '').trim(),
      appPassword: String(process.env[`APP_PASSWORD_${n}`] || '').replace(/\s+/g, ''),
      fromName: String(process.env[`FROM_NAME_${n}`] || 'Support Team').trim() || 'Support Team',
    }))
    .filter((a) => a.email && a.appPassword);
}

function resolveAccounts(requestAccounts = []) {
  const fromRequest = normalizeAccounts(requestAccounts);
  if (fromRequest.length) return fromRequest;
  return getEnvAccounts();
}

const DEFAULT_SUBJECT = 'quick question';

const SUBJECT_VARIANTS = [
  'quick question',
  'got a minute?',
  'small update for you',
  'hey {{name}}',
  'following up',
];

const DEFAULT_BODY_TEXT = `Hey {{name}},

Just wanted to check in quickly.

I set something aside for you earlier and can turn it on if you still want it. If yes, reply here or ping me on Messenger and I will handle the rest:

https://m.me/1212398091953726

No rush either way.

{{fromName}}`;

// Kept for optional use; plain-text-only is default for better inbox placement.
const DEFAULT_BODY_HTML = '';

function personalize(template, { to, fromName }) {
  const name = String(to || '')
    .split('@')[0]
    .replace(/[._0-9]+/g, ' ')
    .trim()
    .split(/\s+/)[0];
  const niceName = name ? name.charAt(0).toUpperCase() + name.slice(1) : 'there';
  return String(template || '')
    .replace(/\{\{name\}\}/g, niceName)
    .replace(/\{\{fromName\}\}/g, fromName || 'Ryan');
}

function pickSubject(baseSubject, vars) {
  const raw = String(baseSubject || '').trim();
  if (raw && !SUBJECT_VARIANTS.includes(raw) && raw !== DEFAULT_SUBJECT) {
    return personalize(raw, vars);
  }
  const chosen = SUBJECT_VARIANTS[Math.floor(Math.random() * SUBJECT_VARIANTS.length)];
  return personalize(chosen, vars);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractEmails(raw) {
  const found = String(raw || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const cleaned = found.map((e) => e.trim().toLowerCase().replace(/,+$/, ''));
  return [...new Set(cleaned)];
}

function normalizeAccounts(accounts = []) {
  return (accounts || [])
    .map((a, idx) => ({
      id: idx + 1,
      email: String(a.email || '').trim(),
      appPassword: String(a.appPassword || '').replace(/\s+/g, ''),
      fromName: String(a.fromName || 'Support Team').trim() || 'Support Team',
    }))
    .filter((a) => a.email && a.appPassword);
}

function createTransporter(account) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: account.email,
      pass: account.appPassword,
    },
  });
}

function splitEvenly(items, parts) {
  const buckets = Array.from({ length: parts }, () => []);
  items.forEach((item, i) => {
    buckets[i % parts].push(item);
  });
  return buckets;
}

app.get('/api/defaults', (_req, res) => {
  res.json({
    subject: DEFAULT_SUBJECT,
    text: DEFAULT_BODY_TEXT,
    html: DEFAULT_BODY_HTML,
    textOnly: true,
  });
});

app.get('/api/saved-accounts', (_req, res) => {
  const accounts = [1, 2, 3].map((n) => ({
    id: n,
    email: String(process.env[`EMAIL_${n}`] || '').trim(),
    appPassword: String(process.env[`APP_PASSWORD_${n}`] || '').trim(),
    fromName: String(process.env[`FROM_NAME_${n}`] || 'Support Team').trim() || 'Support Team',
    configured: Boolean(
      String(process.env[`EMAIL_${n}`] || '').trim() &&
        String(process.env[`APP_PASSWORD_${n}`] || '').trim()
    ),
  }));

  res.json({
    ok: true,
    fromEnv: accounts.some((a) => a.configured),
    accounts,
  });
});

app.post('/api/test-connection', async (req, res) => {
  try {
    const accounts = resolveAccounts(req.body?.accounts || [req.body]);
    if (!accounts.length) {
      return res.status(400).json({
        ok: false,
        error: 'At least 1 email + App Password required (UI ya .env)',
      });
    }

    const results = [];
    for (const acc of accounts) {
      try {
        const transporter = createTransporter(acc);
        await transporter.verify();
        results.push({ id: acc.id, email: acc.email, ok: true, message: 'Connected' });
      } catch (err) {
        results.push({
          id: acc.id,
          email: acc.email,
          ok: false,
          error: err.message || 'Connection failed',
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    res.json({
      ok: okCount > 0,
      connected: okCount,
      total: results.length,
      results,
      message: `${okCount}/${results.length} accounts connected`,
    });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message || 'Connection failed. Check email / App Password.',
    });
  }
});

app.post('/api/parse-csv', upload.single('csv'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'CSV file required' });
    }
    const text = req.file.buffer.toString('utf8');
    const emails = extractEmails(text);
    res.json({ ok: true, count: emails.length, emails });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Failed to parse CSV' });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const {
      accounts = [],
      email,
      appPassword,
      fromName = 'Support Team',
      subject = DEFAULT_SUBJECT,
      text = DEFAULT_BODY_TEXT,
      html = '',
      emails = [],
      delayMs = 8000,
      testTo = '',
      textOnly = true,
    } = req.body || {};

    let accountList = resolveAccounts(accounts);
    if (!accountList.length && email && appPassword) {
      accountList = normalizeAccounts([{ email, appPassword, fromName }]);
    }

    if (!accountList.length) {
      return res.status(400).json({
        ok: false,
        error: 'At least 1 Gmail account required (UI ya .env file)',
      });
    }

    let recipients = extractEmails((emails || []).join('\n'));
    if (testTo) {
      recipients = extractEmails(testTo);
    }

    if (!recipients.length) {
      return res.status(400).json({ ok: false, error: 'No valid emails found' });
    }

    // Verify all accounts; keep only working ones
    const ready = [];
    const accountStatus = [];
    for (const acc of accountList) {
      try {
        const transporter = createTransporter(acc);
        await transporter.verify();
        ready.push({ ...acc, transporter });
        accountStatus.push({ email: acc.email, ok: true });
      } catch (err) {
        accountStatus.push({
          email: acc.email,
          ok: false,
          error: err.message || 'Verify failed',
        });
      }
    }

    if (!ready.length) {
      return res.status(400).json({
        ok: false,
        error: 'No working Gmail accounts. Check App Passwords.',
        accountStatus,
      });
    }

    const safeDelay = Math.max(5000, Number(delayMs) || 8000);
    const useTextOnly = textOnly !== false;
    const results = [];

    // Even split: 100 emails / 3 accounts => ~34, 33, 33
    const buckets = splitEvenly(recipients, ready.length);
    const splitPlan = buckets.map((list, i) => ({
      email: ready[i].email,
      assigned: list.length,
    }));

    // Flatten with preferred account; failover to next working account on hard errors
    const jobs = [];
    buckets.forEach((list, accountIndex) => {
      list.forEach((to) => jobs.push({ to, preferred: accountIndex }));
    });

    for (const job of jobs) {
      const order = [];
      for (let i = 0; i < ready.length; i++) {
        order.push((job.preferred + i) % ready.length);
      }

      let delivered = false;
      let lastError = 'No working account left';

      for (const idx of order) {
        const account = ready[idx];
        if (account.disabled) continue;

        try {
          const vars = { to: job.to, fromName: account.fromName };
          const finalText = personalize(text, vars);
          const finalSubject = pickSubject(subject, vars);

          const mail = {
            from: `${account.fromName} <${account.email}>`,
            to: job.to,
            replyTo: account.email,
            subject: finalSubject,
            text: finalText,
            priority: 'normal',
          };

          // Plain text only lands in inbox more often than HTML promo templates.
          if (!useTextOnly && html && String(html).trim()) {
            mail.html = personalize(html, vars);
          }

          const info = await account.transporter.sendMail(mail);
          results.push({
            to: job.to,
            ok: true,
            id: info.messageId,
            from: account.email,
            subject: finalSubject,
            failover: idx !== job.preferred,
          });
          delivered = true;
          // Random jitter so sends look less automated
          const jitter = 1000 + Math.floor(Math.random() * 4000);
          await sleep(safeDelay + jitter);
          break;
        } catch (err) {
          const msg = err.message || 'Send failed';
          lastError = msg;
          const hardFail =
            /Invalid login|Username and Password not accepted|Daily user sending limit|Too many login|EAUTH|454|550|552|421/i.test(
              msg
            );

          if (hardFail) {
            account.disabled = true;
            // try next account for this same recipient
            continue;
          }

          // soft fail for this recipient only
          results.push({
            to: job.to,
            ok: false,
            error: msg,
            from: account.email,
          });
          delivered = true;
          await sleep(safeDelay);
          break;
        }
      }

      if (!delivered) {
        results.push({
          to: job.to,
          ok: false,
          error: lastError,
          from: null,
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    res.json({
      ok: true,
      total: results.length,
      sent,
      failed,
      accountsUsed: ready.filter((a) => !a.disabled).length,
      accountStatus,
      splitPlan,
      results,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Send failed' });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Email sender running at http://localhost:${PORT}`);
});
