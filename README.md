# Discord Webhook Manager

Full-stack admin website for storing Discord webhooks and broadcasting one message to all or selected active webhooks.

## Stack
- Frontend: React + Vite + React Router + Axios + react-hot-toast
- Backend: Node.js + Express + MongoDB/Mongoose
- Auth: JWT
- Password hashing: bcryptjs
- Webhook URL encryption: AES-256-GCM
- Validation: express-validator + frontend validation

## Features
- Admin login
- Change password
- Add / edit / delete webhooks
- Active / inactive toggle
- Group webhooks (TR, SS, SS_WEB, GENERAL, etc.)
- Send message to all active webhooks or selected webhooks
- Generate NEXT DAY MM/DD/YYYY message
- Broadcast success/failure summary
- Send history with per-webhook result details
- Mobile responsive UI
- Toast notifications
- Server-side and client-side validation

## 1) Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Edit `.env` first.

### Generate WEBHOOK_ENCRYPTION_KEY
Run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character result to `WEBHOOK_ENCRYPTION_KEY`.

On first backend start, the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD` is created automatically if it does not already exist.

## 2) Frontend setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Default frontend: http://localhost:5173
Default backend: http://localhost:5000

## Important
- Never commit `.env` files.
- Discord webhook URLs are encrypted in MongoDB and are never returned in full to the frontend.
- If frontend/backend are hosted on different domains, set `CLIENT_URL` and `VITE_API_URL` correctly.
