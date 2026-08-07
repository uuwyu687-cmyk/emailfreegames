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

const DEFAULT_SUBJECT = 'Your Free $10 Play + 200% First Deposit Bonus Is Waiting';

const DEFAULT_BODY_TEXT = `Hello,

We have a special welcome bonus ready for you.

SPECIAL BONUS DETAILS
--------------------
1) FREE $10 PLAY
   You get $10 play credit ready to use — no complicated steps. Claim it and start enjoying right away.

2) 200% FIRST DEPOSIT BONUS
   When you make your first deposit, you can unlock a 200% bonus on that deposit. That means your first top-up gets a much bigger boost so you can play with more value from day one.

HOW TO CLAIM
------------
Just tap the link below and follow the short steps in chat. Our team will help you activate the bonus quickly:

https://m.me/1212398091953726

This offer is limited, so claim it while it is still available.

If you already claimed it, you can ignore this message.

Thank you,
Bonus Support Team`;

const DEFAULT_BODY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Special Bonus</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:24px 28px;text-align:center;">
              <p style="margin:0;font-size:13px;letter-spacing:1.5px;color:#fbbf24;text-transform:uppercase;">Special Welcome Bonus</p>
              <h1 style="margin:10px 0 0;font-size:26px;line-height:1.3;color:#ffffff;font-weight:700;">Free $10 Play Ready for You</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#374151;">
                Hello,
              </p>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#374151;">
                We saved a special welcome package for you. Here is exactly what you get and how to claim it.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#111827;">1) Free $10 Play</p>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
                      Get <strong>$10 play credit</strong> ready to use. No long process — claim it and start right away.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#111827;">2) 200% First Deposit Bonus</p>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
                      On your first deposit, unlock a <strong>200% bonus</strong>. Your first top-up gets a much bigger boost so you can enjoy more value from day one.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;">How to claim</p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#4b5563;">
                Tap the button below and follow the short steps in chat. Our team will help you activate the bonus quickly. This offer is limited, so claim it while it is still available.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 8px;">
                <tr>
                  <td align="center" style="border-radius:8px;background:#2563eb;">
                    <a href="https://m.me/1212398091953726"
                       style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Claim Your Bonus Now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">
                Or open this link:<br />
                <a href="https://m.me/1212398091953726" style="color:#2563eb;word-break:break-all;">https://m.me/1212398091953726</a>
              </p>

              <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#6b7280;">
                If you already claimed this offer, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                You received this email because you are on our contact list.
                If this was sent by mistake, please ignore it.
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
      fromName: String(a.fromName || 'Bonus Offer').trim() || 'Bonus Offer',
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
      fromName = 'Bonus Offer',
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

    const safeDelay = Math.max(1500, Number(delayMs) || 2500);
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
              'X-Priority': '3',
              'X-Mailer': 'SimpleEmailSender',
              Precedence: 'bulk',
              'List-Unsubscribe': `<mailto:${account.email}?subject=unsubscribe>`,
            },
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
