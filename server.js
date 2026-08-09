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

const DEFAULT_SUBJECT = 'A quick note about your welcome credit';

const DEFAULT_BODY_TEXT = `Hi,

I wanted to share a short update about your account welcome credit.

You currently have a $10 starter credit available. After your first top-up, you can also receive matching support that doubles the value of that first amount (2x).

If you would like help turning this on, reply here or message us on Messenger:
https://m.me/1212398091953726

We are happy to walk you through it step by step.

Thanks,
Support Team`;

const DEFAULT_BODY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome credit</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,'Times New Roman',serif;color:#222222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6e6;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#222222;font-family:Georgia,'Times New Roman',serif;">
                Hi,
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#222222;font-family:Georgia,'Times New Roman',serif;">
                I wanted to share a short update about your account welcome credit.
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#222222;font-family:Georgia,'Times New Roman',serif;">
                You currently have a <strong>$10 starter credit</strong> available. After your first top-up, you can also receive matching support that doubles the value of that first amount (2x).
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#222222;font-family:Georgia,'Times New Roman',serif;">
                If you would like help turning this on, message us here:
              </p>
              <p style="margin:0 0 22px;font-size:16px;line-height:1.7;font-family:Georgia,'Times New Roman',serif;">
                <a href="https://m.me/1212398091953726" style="color:#1a56db;text-decoration:underline;">
                  https://m.me/1212398091953726
                </a>
              </p>
              <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#222222;font-family:Georgia,'Times New Roman',serif;">
                We are happy to walk you through it step by step.
              </p>
              <p style="margin:0;font-size:16px;line-height:1.7;color:#222222;font-family:Georgia,'Times New Roman',serif;">
                Thanks,<br />
                Support Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 26px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#888888;font-family:Arial,sans-serif;">
                You are receiving this because you are on our contact list.
                If this does not apply to you, feel free to ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

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
  });
});

app.post('/api/test-connection', async (req, res) => {
  try {
    const accounts = normalizeAccounts(req.body?.accounts || [req.body]);
    if (!accounts.length) {
      return res.status(400).json({ ok: false, error: 'At least 1 email + App Password required' });
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
      html = DEFAULT_BODY_HTML,
      emails = [],
      delayMs = 2500,
      testTo = '',
    } = req.body || {};

    let accountList = normalizeAccounts(accounts);
    if (!accountList.length && email && appPassword) {
      accountList = normalizeAccounts([{ email, appPassword, fromName }]);
    }

    if (!accountList.length) {
      return res.status(400).json({ ok: false, error: 'At least 1 Gmail account required' });
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

    const safeDelay = Math.max(3000, Number(delayMs) || 4000);
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
          const info = await account.transporter.sendMail({
            from: `"${account.fromName}" <${account.email}>`,
            to: job.to,
            subject,
            text,
            html,
            headers: {
              'List-Unsubscribe': `<mailto:${account.email}?subject=unsubscribe>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            replyTo: account.email,
          });
          results.push({
            to: job.to,
            ok: true,
            id: info.messageId,
            from: account.email,
            failover: idx !== job.preferred,
          });
          delivered = true;
          await sleep(safeDelay);
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
