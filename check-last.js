require('dotenv').config();
const { ImapFlow } = require('imapflow');

const email = (process.env.EMAIL_1 || '').trim();
const pass = (process.env.APP_PASSWORD_1 || '').replace(/\s+/g, '');
const needle = process.argv[2] || 'inbox-check';

async function scan(client, mailbox) {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const exists = client.mailbox.exists || 0;
      if (!exists) return [];
      const start = Math.max(1, exists - 30);
      const hits = [];
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, uid: true })) {
        const subject = msg.envelope?.subject || '';
        const from = (msg.envelope?.from || []).map((x) => x.address).join(',');
        const to = (msg.envelope?.to || []).map((x) => x.address).join(',');
        if (subject.toLowerCase().includes(needle.toLowerCase()) || from.includes('sr8243382')) {
          hits.push({ mailbox, uid: msg.uid, subject, from, to, date: msg.envelope?.date });
        }
      }
      return hits.filter((h) => h.subject.toLowerCase().includes(needle.toLowerCase()));
    } finally {
      lock.release();
    }
  } catch (err) {
    console.log(`${mailbox}: ${err.message}`);
    return [];
  }
}

async function main() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
  });
  await client.connect();

  const listed = await client.list();
  const boxes = listed.map((b) => b.path);
  console.log('Mailboxes:', boxes.filter((b) => /inbox|spam|junk|all/i.test(b)).join(' | '));

  const targets = ['INBOX', ...boxes.filter((b) => /Spam|Junk|All Mail/i.test(b))];
  const uniqueTargets = [...new Set(targets)];
  let all = [];
  for (const t of uniqueTargets) {
    const hits = await scan(client, t);
    all = all.concat(hits);
  }

  await client.logout();

  if (!all.length) {
    console.log(`No messages matching "${needle}"`);
    process.exit(2);
  }

  console.log('\nMatches:');
  all.forEach((h) => console.log(`- [${h.mailbox}] ${h.subject} @ ${h.date}`));

  const inInbox = all.some((h) => h.mailbox === 'INBOX');
  const inSpam = all.some((h) => /spam|junk/i.test(h.mailbox));
  if (inInbox && !inSpam) console.log('\nRESULT: INBOX ✅');
  else if (inSpam) console.log('\nRESULT: SPAM ❌');
  else console.log('\nRESULT: other folder');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
