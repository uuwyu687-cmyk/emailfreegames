require('dotenv').config();
const { ImapFlow } = require('imapflow');

const email = (process.env.EMAIL_1 || '').trim();
const pass = (process.env.APP_PASSWORD_1 || '').replace(/\s+/g, '');

async function dump(client, mailbox) {
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const exists = client.mailbox.exists || 0;
      console.log(`\n=== ${mailbox} (exists=${exists}) ===`);
      if (!exists) return;
      const start = Math.max(1, exists - 8);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, source: false })) {
        const env = msg.envelope || {};
        console.log(
          `#${msg.seq} | ${env.date} | ${env.subject} | from=${(env.from || []).map((x) => x.address).join(',')}`
        );
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.log(`\n=== ${mailbox} ERROR: ${err.message}`);
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
  const paths = listed.map((b) => b.path);
  console.log('All boxes:', paths.join(' | '));

  for (const p of paths) {
    if (/INBOX|Spam|Sent|All Mail|Important|Promotions/i.test(p)) {
      await dump(client, p);
    }
  }
  await client.logout();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
