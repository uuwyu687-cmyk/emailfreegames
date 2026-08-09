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
const subject = `Following up on your account (${marker})`;

const text = `Hi there,

Hope you are doing well. I am writing regarding the starter credit on your account.

There is a small credit already reserved for you. After your first top-up, matching support can also be added so your starting balance goes further.

If you want me to enable it for you, just reply to this email or message me here:
https://m.me/1212398091953726

Happy to help either way.

Best,
${fromName}

Ref: ${marker}`;

const html = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;">
<p>Hi there,</p>
<p>Hope you are doing well. I am writing regarding the starter credit on your account.</p>
<p>There is a small credit already reserved for you. After your first top-up, matching support can also be added so your starting balance goes further.</p>
<p>If you want me to enable it for you, just reply to this email or message me here:<br>
<a href="https://m.me/1212398091953726">https://m.me/1212398091953726</a></p>
<p>Happy to help either way.</p>
<p>Best,<br>${fromName}</p>
<p style="color:#999;font-size:12px;">Ref: ${marker}</p>
</body></html>`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findInMailbox(client, mailbox) {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = await client.search({ subject: marker });
      if (!uids || !uids.length) return null;
      const uid = uids[uids.length - 1];
      const msg = await client.fetchOne(uid, { envelope: true });
      return {
        mailbox,
        uid,
        subject: msg.envelope?.subject || '',
        date: msg.envelope?.date,
      };
    } finally {
      lock.release();
    }
  } catch (err) {
    return { mailbox, error: err.message };
  }
}

async function main() {
  console.log('1) Connecting SMTP...');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: email, pass },
  });
  await transporter.verify();
  console.log('   SMTP OK:', email);

  console.log('2) Sending test email to self...');
  const info = await transporter.sendMail({
    from: `"${fromName}" <${email}>`,
    to: email,
    replyTo: email,
    subject,
    text,
    html,
    priority: 'normal',
  });
  console.log('   Sent messageId:', info.messageId);

  console.log('3) Waiting 20s for Gmail to place the message...');
  await sleep(20000);

  console.log('4) Checking IMAP folders...');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
  });

  await client.connect();

  const folders = ['INBOX', '[Gmail]/Spam', '[Gmail]/All Mail'];
  const found = [];
  for (const folder of folders) {
    const hit = await findInMailbox(client, folder);
    if (hit && hit.uid) found.push(hit);
    else if (hit && hit.error) console.log(`   ${folder}: ${hit.error}`);
  }

  await client.logout();

  if (!found.length) {
    console.log('\nRESULT: Message not found yet in INBOX / Spam / All Mail.');
    console.log('Wait 1 minute and run: node verify-inbox.js');
    process.exit(2);
  }

  const inInbox = found.some((f) => f.mailbox === 'INBOX');
  const inSpam = found.some((f) => /spam/i.test(f.mailbox));

  console.log('\nFound in:');
  found.forEach((f) => console.log(` - ${f.mailbox} | ${f.subject}`));

  if (inInbox && !inSpam) {
    console.log('\nRESULT: INBOX ✅ (not in Spam)');
    process.exit(0);
  }
  if (inSpam) {
    console.log('\nRESULT: SPAM ❌');
    process.exit(1);
  }
  console.log('\nRESULT: Found in All Mail only (check Gmail tabs/filters).');
  process.exit(3);
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
