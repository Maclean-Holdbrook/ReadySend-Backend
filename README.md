# ReadySend Backend

Express API for ReadySend, a seller order confirmation app for online sellers.

The backend handles seller authentication, public buyer order requests, receipt confirmation links, subscriptions, contact emails, and Supabase data access.

## Live Services

- API: https://api.readysend.online
- Frontend: https://readysend.online

Health check:

```text
GET /health
```

## Main Features

- Seller signup and login.
- Seller public order link generation.
- Public buyer order request submission.
- Seller dashboard order creation and editing.
- Buyer receipt pages and confirmation flow.
- Pending and confirmed order tracking.
- Monthly order limits by subscription plan.
- Flutterwave subscription checkout and webhook handling.
- Resend email notifications for contact messages and buyer request alerts.

## Tech Stack

- Node.js
- Express
- Supabase
- Flutterwave
- Resend
- Vercel serverless deployment

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required `.env` values:

```env
PORT=4000
APP_BASE_URL=http://localhost:4000
WEB_APP_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TOKEN_SECRET=

RESEND_API_KEY=
CONTACT_TO_EMAIL=
CONTACT_FROM_EMAIL=ReadySend <onboarding@resend.dev>

FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_WEBHOOK_HASH=
FLUTTERWAVE_PRO_PLAN_ID=
FLUTTERWAVE_GROWTH_PLAN_ID=
```

Production values should use:

```env
APP_BASE_URL=https://api.readysend.online
WEB_APP_URL=https://readysend.online
ALLOWED_ORIGINS=https://readysend.online,https://www.readysend.online
```

## Supabase

Run the SQL files in `supabase/` in order, or use `supabase/schema.sql` for a full schema setup.

Important tables include:

- `sellers`
- `seller_accounts`
- `orders`
- `buyer_order_requests`
- `confirmation_proofs`
- `seller_subscriptions`
- `payments`

Security note: the backend uses the Supabase service role key and must remain server-side only. RLS is enabled to deny direct client table access; normal app access is expected to go through the backend.

## Flutterwave

Flutterwave is used for ReadySend seller subscriptions.

Plans currently supported:

- Pro: GHS 39/month
- Growth: GHS 89/month

Set these environment variables in production:

```env
FLUTTERWAVE_SECRET_KEY=FLWSECK_LIVE_...
FLUTTERWAVE_WEBHOOK_HASH=...
FLUTTERWAVE_PRO_PLAN_ID=...
FLUTTERWAVE_GROWTH_PLAN_ID=...
```

Webhook URL:

```text
https://api.readysend.online/api/billing/webhook
```

## Deployment

This backend is prepared for Vercel with:

- `api/index.js`
- `vercel.json`

Recommended Vercel settings:

- Framework preset: Other
- Root directory: repository root
- Domain: `api.readysend.online`

## Related Repository

Frontend:

https://github.com/Maclean-Holdbrook/ReadySend
