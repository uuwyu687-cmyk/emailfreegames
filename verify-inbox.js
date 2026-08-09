require('dotenv').config();
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const email = (process.env.EMAIL_1 || '').trim();
const pass = (process.env.APP_PASSWORD_1 || '').replace(/\s+/g, '');
const fromName = (process.env.FROM_NAME_1 || 'Daniel').trim();
const link = String(process.env.MESSAGE_LINK || 'https://m.me/1212398091953726').trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findMarker(client, mailbox, marker) {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const exists = client.mailbox.exists || 0;
      if (!exists) return null;
      const start = Math.max(1, exists - 40);
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
  const marker = `promo-check-${Date.now()}`;
  const subject = 'Thought of you earlier';
  const text = `Hi,

Hope you are doing well. I wanted to reconnect and make this easier for both of us.

Whenever you are free, please message me on this chat and I will take it from there:

${link}

Thanks,
${fromName}

Ref: ${marker}`;

  console.log('Account:', email);
  console.log('Promo link:', link);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: email, pass },
  });
  await transporter.verify();
  const info = await transporter.sendMail({
    from: `${fromName} <${email}>`,
    to: email,
    replyTo: email,
    subject,
    text,
  });
  console.log('Sent:', info.messageId);

  console.log('Waiting 25s...');
  await sleep(25000);

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
  });
  await client.connect();
  const listed = await client.list();
  const spamPaths = listed
    .filter((b) => b.specialUse === '\\Junk' || /spam|junk|ขยะ/i.test(b.path))
    .map((b) => b.path);
  const allPaths = listed
    .filter((b) => b.path === 'INBOX' || b.specialUse === '\\All' || /all mail|ทั้งหมด/i.test(b.path))
    .map((b) => b.path);

  const found = [];
  for (const folder of [...new Set([...allPaths, ...spamPaths])]) {
    const hit = await findMarker(client, folder, marker);
    if (hit?.subject) found.push(hit);
  }
  await client.logout();

  if (!found.length) {
    console.log('\nRESULT: NOT FOUND');
    process.exit(2);
  }
  console.log('\nFound:');
  found.forEach((f) => console.log(' -', f.mailbox, '|', f.subject));

  const inInbox = found.some((f) => f.mailbox === 'INBOX');
  const inSpam = found.some((f) => spamPaths.includes(f.mailbox));
  if (inInbox && !inSpam) {
    console.log('\nRESULT: INBOX ✅ (promo link included)');
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
  console.error(e.message || e);
  process.exit(1);
});
