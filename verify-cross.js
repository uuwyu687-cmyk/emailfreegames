/**
 * Send from EMAIL_1 -> EMAIL_2 and check if it landed in INBOX or Spam.
 * Run: node verify-cross.js
 */
require('dotenv').config();
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const fromEmail = (process.env.EMAIL_1 || '').trim();
const fromPass = (process.env.APP_PASSWORD_1 || '').replace(/\s+/g, '');
const fromName = (process.env.FROM_NAME_1 || 'Daniel').trim();
const toEmail = (process.env.EMAIL_2 || '').trim();
const toPass = (process.env.APP_PASSWORD_2 || '').replace(/\s+/g, '');
const link = String(process.env.MESSAGE_LINK || '').trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scanFolder(client, mailbox, marker) {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const exists = client.mailbox.exists || 0;
      if (!exists) return null;
      const start = Math.max(1, exists - 50);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true, uid: true })) {
        const raw = msg.source ? msg.source.toString('utf8') : '';
        const subject = msg.envelope?.subject || '';
        if (raw.includes(marker) || subject.includes(marker)) {
          return { mailbox, subject, date: msg.envelope?.date };
        }
      }
      return null;
    } finally {
      lock.release();
    }
  } catch (err) {
    return { mailbox, error: err.message };
  }
}

async function main() {
  if (!fromEmail || !fromPass || !toEmail || !toPass) {
    console.error('Need EMAIL_1/APP_PASSWORD_1 and EMAIL_2/APP_PASSWORD_2 in .env');
    process.exit(1);
  }

  const marker = `vfy-${Date.now()}`;
  const subject = 'missed your reply';
  let text = `Hi,

I messaged you earlier and did not get a reply, so I am checking again.

If you are free, just reply to this email with "ok" and I will continue from there.

${fromName}

Ref: ${marker}`;

  if (link) {
    text += `\n\nIf easier, you can also reach me here:\n${link}\n`;
  }

  console.log(`FROM: ${fromEmail}`);
  console.log(`TO:   ${toEmail}`);
  console.log(`LINK: ${link ? 'YES (higher spam risk)' : 'NO (inbox mode)'}`);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: fromEmail, pass: fromPass },
  });
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: toEmail,
    replyTo: fromEmail,
    subject,
    text,
  });
  console.log('Sent:', info.messageId, '|', info.response);

  console.log('Waiting 35s for delivery...');
  await sleep(35000);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: toEmail, pass: toPass },
    logger: false,
  });
  await client.connect();
  const listed = await client.list();
  const paths = listed.map((b) => b.path);
  const targets = ['INBOX', ...paths.filter((p) => /Spam|Junk|All Mail/i.test(p))];

  const found = [];
  for (const folder of [...new Set(targets)]) {
    const hit = await scanFolder(client, folder, marker);
    if (hit?.subject) found.push(hit);
    else if (hit?.error) console.log(`${folder}: ${hit.error}`);
  }
  await client.logout();

  if (!found.length) {
    console.log('\nRESULT: NOT FOUND on recipient (quota/delay/block)');
    process.exit(2);
  }

  console.log('\nFound:');
  found.forEach((f) => console.log(` - ${f.mailbox} | ${f.subject}`));

  const inInbox = found.some((f) => f.mailbox === 'INBOX');
  const inSpam = found.some((f) => /spam|junk/i.test(f.mailbox));

  if (inInbox && !inSpam) {
    console.log('\nRESULT: INBOX ✅');
    process.exit(0);
  }
  if (inSpam) {
    console.log('\nRESULT: SPAM ❌');
    process.exit(1);
  }
  console.log('\nRESULT: other folder');
  process.exit(3);
}

main().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
