require('dotenv').config();
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const email = (process.env.EMAIL_1 || '').trim();
const pass = (process.env.APP_PASSWORD_1 || '').replace(/\s+/g, '');
const fromName = (process.env.FROM_NAME_1 || 'Ryan').trim();

if (!email || !pass) {
  console.error('Missing EMAIL_1 / APP_PASSWORD_1 in .env');
  process.exit(1);
}

const marker = `inbox-check-${Date.now()}`;
const subject = `quick question`;
const text = `Hey there,

Just wanted to check in quickly.

I set something aside for you earlier and can turn it on if you still want it. If yes, reply here or ping me on Messenger and I will handle the rest:

https://m.me/1212398091953726

No rush either way.

${fromName}

Ref: ${marker}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findInMailbox(client, mailbox) {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const exists = client.mailbox.exists || 0;
      if (!exists) return null;
      const start = Math.max(1, exists - 40);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: true, uid: true })) {
        const subjectText = msg.envelope?.subject || '';
        const raw = msg.source ? msg.source.toString('utf8') : '';
        if (raw.includes(marker) || subjectText.includes(marker)) {
          return { mailbox, uid: msg.uid, subject: subjectText, date: msg.envelope?.date };
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
  console.log('1) SMTP connect...');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: email, pass },
  });
  await transporter.verify();

  console.log('2) Sending PLAIN TEXT test to self...');
  const info = await transporter.sendMail({
    from: `${fromName} <${email}>`,
    to: email,
    replyTo: email,
    subject,
    text,
  });
  console.log('   messageId:', info.messageId);
  console.log('   response:', info.response);

  console.log('3) Waiting 25s...');
  await sleep(25000);

  console.log('4) IMAP check...');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
  });
  await client.connect();

  const listed = await client.list();
  const paths = listed.map((b) => b.path);
  const targets = ['INBOX', ...paths.filter((p) => /Spam|Junk|Sent|All Mail/i.test(p))];

  const found = [];
  for (const folder of [...new Set(targets)]) {
    const hit = await findInMailbox(client, folder);
    if (hit?.uid) found.push(hit);
    else if (hit?.error) console.log(`   ${folder}: ${hit.error}`);
  }
  await client.logout();

  if (!found.length) {
    console.log('\nRESULT: NOT FOUND (storage/quota issue likely — mail accepted but not stored)');
    process.exit(2);
  }

  console.log('\nFound in:');
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
  console.log('\nRESULT: other folder only');
  process.exit(3);
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
