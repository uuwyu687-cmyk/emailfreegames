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
      fromName: String(process.env[`FROM_NAME_${n}`] || 'Daniel').trim() || 'Daniel',
    }))
    .filter((a) => a.email && a.appPassword);
}

function resolveAccounts(requestAccounts = []) {
  const fromRequest = normalizeAccounts(requestAccounts);
  if (fromRequest.length) return fromRequest;
  return getEnvAccounts();
}

// Promo chat link (set in .env). Keep copy soft — hard "bonus/free/$" words increase Spam.
const ALLOW_LINKS = String(process.env.ALLOW_LINKS || 'true').toLowerCase() !== 'false';
const LINK = String(
  process.env.MESSAGE_LINK || 'https://m.me/1212398091953726'
).trim();

// Natural subjects only — NEVER put links here.
const DEFAULT_SUBJECT = 'The hard part after you start';

const SUBJECT_VARIANTS = [
  'The hard part after you start',
  'This is usually where people get stuck',
  'A simpler way to continue',
  'Quick note on what comes next',
  'Made this easier for you',
];

// Point-style promo copy (Clipzy-style). Link ONLY in body.
const BODY_VARIANTS = [
  `Hi{{namePart}},

The hard part is usually what comes next:
→ Not knowing where to start
→ Waiting on long back-and-forth
→ Missing clear next steps
→ Trying to figure it out alone

We built a simpler way.
One chat. Clear answers. Next step done before you overthink it.

Open here when you are free:
{{link}}

{{fromName}}`,

  `Hi{{namePart}},

Most people get stuck here:
→ Too many options, no clear path
→ Emails that take forever
→ No one guiding the next move
→ Starting over every time

That workflow is what we remove.
One message. One chat. Straight to the point.

Continue here:
{{link}}

{{fromName}}`,

  `Hi{{namePart}},

After the interest fades, this is what slows people down:
→ Unclear instructions
→ Delayed replies
→ Robot-sounding follow-ups
→ Doing the same loop next week

We made that simple.
One recording of your question. One chat. Guidance + next steps — done.

Start here:
{{link}}

{{fromName}}`,
];

const DEFAULT_BODY_TEXT = BODY_VARIANTS[0];

// Kept for optional use; plain-text-only is default for better inbox placement.
const DEFAULT_BODY_HTML = '';

function cleanFromName(name, email) {
  const bad = /^(support\s*team|bonus\s*offer|admin|noreply|no-reply|freegameplay)$/i;
  const n = String(name || '').trim();
  if (n && !bad.test(n)) return n;
  return 'Daniel';
}

function recipientFirstName(to) {
  const raw = String(to || '').split('@')[0] || '';
  const name = raw.replace(/[._0-9]+/g, ' ').trim().split(/\s+/)[0] || '';
  // Skip gamer/spammy local-parts — they look automated
  if (!name || name.length < 2 || name.length > 10) return '';
  if (/pubg|free|game|hack|bonus|win|money|xxx|admin|test/i.test(name)) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function fillVars(template, { to, fromName }) {
  const niceName = recipientFirstName(to);
  const namePart = niceName ? ` ${niceName}` : '';
  return String(template || '')
    .replace(/\{\{namePart\}\}/g, namePart)
    .replace(/\{\{name\}\}/g, niceName || 'there')
    .replace(/\{\{fromName\}\}/g, fromName || 'Daniel')
    .replace(/\{\{link\}\}/g, LINK);
}

function stripUrls(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bm\.me\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickSubject(baseSubject, vars) {
  const raw = String(baseSubject || '').trim();
  const burnedSubject =
    /^hey\s+/i.test(raw) ||
    /messenger|m\.me|https?:\/\//i.test(raw) ||
    /check this when free|finish what we started|quick question|got a minute|free \$|200%|bonus|continue on chat|better on messenger|Thought of you earlier/i.test(
      raw
    );

  let subject;
  if (raw && !burnedSubject && !SUBJECT_VARIANTS.includes(raw) && raw !== DEFAULT_SUBJECT) {
    subject = fillVars(raw, vars);
  } else {
    subject = fillVars(SUBJECT_VARIANTS[Math.floor(Math.random() * SUBJECT_VARIANTS.length)], vars);
  }

  // Hard guarantee: subject never contains a link
  subject = stripUrls(subject);
  if (!subject) subject = DEFAULT_SUBJECT;
  return subject;
}

function pickBody(baseText, vars) {
  const raw = String(baseText || '').trim();
  const burned =
    /set something aside|ping me on Messenger|No rush either way|finish what we started|account setup pending|FREE \$|200%|First Deposit|Claim Your Bonus|can we continue on chat/i.test(
      raw
    );
  let out;
  if (raw && !burned) {
    out = fillVars(raw, vars);
  } else {
    const chosen = BODY_VARIANTS[Math.floor(Math.random() * BODY_VARIANTS.length)];
    out = fillVars(chosen, vars);
  }
  if (!ALLOW_LINKS) {
    out = out.replace(/https?:\/\/\S+/gi, '').replace(/\n{3,}/g, '\n\n').trim();
  } else if (LINK && !out.includes(LINK)) {
    out += `\n\nYou can reach me here:\n${LINK}\n`;
  }
  return out;
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
      fromName: cleanFromName(a.fromName, a.email),
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
    fromName: String(process.env[`FROM_NAME_${n}`] || 'Daniel').trim() || 'Daniel',
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
      fromName = 'Daniel',
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
          const fromName = cleanFromName(account.fromName, account.email);
          const vars = { to: job.to, fromName };
          const finalText = pickBody(text, vars);
          const finalSubject = pickSubject(subject, vars);

          const mail = {
            from: `${fromName} <${account.email}>`,
            to: job.to,
            replyTo: account.email,
            subject: finalSubject,
            text: finalText,
            priority: 'normal',
          };

          // Plain text only lands in inbox more often than HTML promo templates.
          if (!useTextOnly && html && String(html).trim()) {
            mail.html = fillVars(html, vars);
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
