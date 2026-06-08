# SmartBooks Baileys Worker

Production-ready Node.js worker for sending SmartBooks AI / SmartLocal AI WhatsApp messages through Baileys.

This project is only the WhatsApp worker. Your main accounting dashboard stays in the separate Next.js app.

## Features

- Express API for health checks, QR status, and queue management
- Baileys WhatsApp login with QR code and multi-file session persistence
- Neon PostgreSQL queue tables and migration script
- Slow queue worker with configurable polling, delays, and retry limits
- Anti-ban safety controls with daily limits, per-phone limits, office hours, and opt-in checks
- `FOR UPDATE SKIP LOCKED` queue claiming for safer worker behavior
- API-key protected message and QR endpoints
- Pino structured logging
- Railway-ready start command

## Setup

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

Update `.env`:

```bash
DATABASE_URL=postgresql://username:password@host/dbname?sslmode=require
API_KEY=your-long-random-secret
SESSION_DIR=./auth_info
SEND_DELAY_MIN_MS=45000
SEND_DELAY_MAX_MS=120000
```

For Railway, set:

```bash
SESSION_DIR=/app/auth_info
```

Add a Railway volume mounted at `/app/auth_info` so WhatsApp sessions persist across deploys.
QR scan is only required the first time unless WhatsApp logs out or the `auth_info` session files are lost.

## Database

Run the migration after setting `DATABASE_URL`:

```bash
npm run migrate
```

This creates:

- `whatsapp_message_queue`
- `whatsapp_message_logs`
- `whatsapp_opt_ins`
- `updated_at` trigger function and triggers

## Development

```bash
npm run dev
```

The QR code prints in the terminal when WhatsApp needs login. You can also fetch the current QR payload from the protected API.

## Production

```bash
npm start
```

Railway uses `railway.toml`:

```toml
[deploy]
startCommand = "npm start"
```

## API

Public health:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/status
curl http://localhost:3000/health/db
```

QR status:

```bash
curl -H "x-api-key: your-long-random-secret" http://localhost:3000/qr
curl -H "x-api-key: your-long-random-secret" http://localhost:3000/qr/json
```

Create a queued WhatsApp message:

```bash
curl -X POST http://localhost:3000/api/messages/enqueue \
  -H "content-type: application/json" \
  -H "x-api-key: your-long-random-secret" \
  -d '{
    "organization_id": 1,
    "recipient_name": "Parent",
    "recipient_phone": "9999999999",
    "message_type": "GENERAL",
    "message_text": "Hello from SmartBooks AI",
    "priority": 5
  }'
```

Send a test message immediately:

```bash
curl -X POST http://localhost:3000/api/messages/send-test \
  -H "content-type: application/json" \
  -H "x-api-key: your-long-random-secret" \
  -d '{
    "recipient_phone": "9999999999",
    "message_text": "Test message from SmartBooks AI"
  }'
```

List recent messages:

```bash
curl -H "x-api-key: your-long-random-secret" \
  "http://localhost:3000/api/messages?status=PENDING&limit=25"
```

Queue stats:

```bash
curl -H "x-api-key: your-long-random-secret" \
  http://localhost:3000/api/messages/stats
```

Safety limits:

```bash
curl -H "x-api-key: your-long-random-secret" \
  http://localhost:3000/api/messages/limits
```

Cancel a pending message:

```bash
curl -X POST \
  -H "x-api-key: your-long-random-secret" \
  http://localhost:3000/api/messages/1/cancel
```

## Phone Numbers

The worker formats Indian WhatsApp numbers:

- `9999999999` becomes `919999999999@s.whatsapp.net`
- `919999999999` stays `919999999999@s.whatsapp.net`

Spaces, `+`, `-`, and brackets are removed before validation.

## Queue Behavior

The worker only sends when WhatsApp is connected.

Defaults:

- Poll every `5000ms`
- Send one message per cycle
- Wait `45000ms` to `120000ms` before each send
- Retry until `MAX_ATTEMPTS`

Failed messages move back to `PENDING` until their final attempt, then become `FAILED`.

## Anti-ban Safety Settings

These controls reduce sending risk, but they do not guarantee that WhatsApp will never restrict or ban a number.

- `DAILY_MESSAGE_LIMIT`: maximum successful sends allowed per day. Start with `10` to `25` messages/day.
- `PER_PHONE_DAILY_LIMIT`: maximum successful sends to the same parent phone per day.
- `SEND_DELAY_MIN_MS`: minimum random wait before a send. Keep this slow, such as `45000`.
- `SEND_DELAY_MAX_MS`: maximum random wait before a send. Keep this slow, such as `120000`.
- `SENDING_START_HOUR`: local office-hour start, using `TIMEZONE`.
- `SENDING_END_HOUR`: local office-hour end, using `TIMEZONE`.
- `TIMEZONE`: local timezone for office-hours decisions, for example `Asia/Kolkata`.
- `RESCHEDULE_HOUR`: hour used when a message is delayed to the next day.

The worker checks global daily sent count, per-parent daily sent count, minimum gap after the latest sent message, office-hours window, and `whatsapp_opt_ins` before sending.

Messages from opted-out parents are cancelled. If no opt-in row exists, only transactional message types are allowed: `FEE_PAYMENT_RECEIPT`, `PAYMENT_SUCCESS`, and `ADMISSION_CONFIRMATION`. General, promotional, bulk, and reminder-style messages require opt-in.

Use only opted-in parents, avoid bulk blasting, and use a dedicated WhatsApp Business number. For paid production or higher-volume workflows, use the official WhatsApp Cloud API.

For Railway, mount a Volume at `/app/auth_info` and set:

```bash
SESSION_DIR=/app/auth_info
```

Without that volume, Railway redeploys can lose the Baileys session and require scanning the WhatsApp QR again.

## Important Notes

- Do not expose QR or message APIs publicly without `API_KEY`.
- Keep `auth_info/` out of git. It contains WhatsApp session credentials.
- Railway ephemeral disk can lose session files during redeploys. If that happens, scan the QR code again.
- WhatsApp automation must follow WhatsApp policies and local consent requirements.
- Use only opted-in parents and keep sending slow.
- For paid production or high-volume workflows, consider the official WhatsApp Cloud API.

## Next.js Dashboard Integration

Your separate SmartBooks AI dashboard can enqueue messages with:

```bash
curl -X POST https://my-railway-worker-url/api/messages/enqueue \
  -H "content-type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{
    "recipient_name": "Ramesh Parent",
    "recipient_phone": "9876543210",
    "message_type": "FEE_PENDING",
    "message_text": "Dear Parent, your child has pending school fees of Rs. 5,500. Kindly clear it soon. - SmartBooks AI",
    "student_id": 12,
    "admission_id": 22,
    "parent_id": 8
  }'
```

## Railway Deploy Checklist

1. Push this folder to GitHub.
2. Create a Railway New Project from the GitHub repository.
3. Add environment variables from `.env.example`.
4. Add a volume with mount path `/app/auth_info`.
5. Set `SESSION_DIR=/app/auth_info`.
6. Deploy.
7. Open Railway logs and scan the WhatsApp QR from Linked Devices.
8. Run `npm run migrate` locally or from a Railway shell with `DATABASE_URL` set.
