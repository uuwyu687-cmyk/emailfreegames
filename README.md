# MailFlow — Simple Email Sender

Gmail App Password se connect karke CSV ki emails par message bhejo.
3 accounts support, auto-split, failover.

## Setup

```bash
npm install
copy .env.example .env
```

`.env` mein apni emails + App Passwords likho:

```env
EMAIL_1=you1@gmail.com
APP_PASSWORD_1=xxxx xxxx xxxx xxxx
FROM_NAME_1=Daniel

EMAIL_2=you2@gmail.com
APP_PASSWORD_2=xxxx xxxx xxxx xxxx

EMAIL_3=you3@gmail.com
APP_PASSWORD_3=xxxx xxxx xxxx xxxx
```

Phir:

```bash
npm start
```

Browser: http://localhost:5050

Page open hote hi `.env` se accounts auto-fill ho jayenge — bar bar type karne ki zarurat nahi.

## Gmail App Password

1. Google Account → Security
2. 2-Step Verification ON
3. App passwords → Mail → Generate
4. 16-character password `.env` mein paste karo

## CSV format

```text
user1@gmail.com,
user2@gmail.com,
```

Trailing commas OK. Duplicates auto-remove.

## Tips

- Pehle test email apne inbox par bhejo
- Delay 4000ms rakho
- Naye Gmail pe din mein zyada mat bhejo
- `.env` kabhi GitHub pe commit mat karna
