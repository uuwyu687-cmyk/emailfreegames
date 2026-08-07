# MailFlow — Simple Email Sender

Gmail App Password se connect karke CSV ki emails par message bhejo.

## Run

```bash
cd simple_email_sender
npm install
npm start
```

Browser: http://localhost:5050

## Gmail App Password

1. Google Account → Security
2. 2-Step Verification ON karo
3. App passwords → Mail → Generate
4. 16-character password yahan paste karo

## CSV format

Column A mein emails (trailing comma OK):

```text
user1@gmail.com,
user2@gmail.com,
```

Tool commas hata deta hai aur duplicates remove karta hai.

## Spam kam karne ke tips

- Pehle **Send Test Email** apne inbox par bhejo
- Delay 2500ms+ rakho
- Ek din mein bahut zyada emails mat bhejo (naye Gmail pe ~50–100/day safe)
- Recipients ko pehle se permission hona chahiye
- Subject/body mein ALL CAPS + bohot emojis spam filter trigger kar sakte hain
