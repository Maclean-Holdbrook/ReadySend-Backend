# ReadySend Backend

Express API for the ReadySend trust-confirmation wedge.

## What This Backend Handles

- Seller profile creation.
- Order creation with signed buyer confirmation links.
- Public buyer receipt lookup.
- Buyer confirmation with proof trail creation.
- Dispatch-readiness checklist updates.
- Manual WhatsApp reminder copy.
- Product event logging for the confirmation funnel.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env`.
4. Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TOKEN_SECRET`.
5. Install dependencies and start:

```bash
npm install
npm run dev
```

## API

### Health

`GET /health`

### Sellers

`POST /api/sellers`

```json
{
  "businessName": "Ama Styles",
  "whatsappPhone": "+233...",
  "category": "clothing",
  "mainChannel": "whatsapp",
  "logoUrl": "https://..."
}
```

### Orders

`POST /api/orders`

```json
{
  "sellerId": "uuid",
  "buyerName": "Esi",
  "buyerPhone": "+233...",
  "productName": "Blue dress",
  "productVariation": "Size M",
  "quantity": 1,
  "amount": 250,
  "currency": "GHS",
  "deliveryArea": "Accra",
  "deliveryAddress": "Optional precise address",
  "deliveryDate": "2026-05-25",
  "paymentTerms": "pay_on_delivery",
  "internalNotes": "Do not show this to buyer"
}
```

Returns the order plus `confirmationUrl`.

`GET /api/orders?sellerId=uuid`

`GET /api/orders/:id?sellerId=uuid`

`PATCH /api/orders/:id/readiness`

```json
{
  "sellerId": "uuid",
  "packageReady": true
}
```

`POST /api/orders/:id/reminder-copy`

```json
{
  "sellerId": "uuid"
}
```

### Buyer Receipt

`GET /api/receipts/:token`

`POST /api/receipts/:token/confirm`

```json
{
  "buyerName": "Esi",
  "buyerPhone": "+233...",
  "deliveryAddress": "Updated address if needed"
}
```

## Security Notes

- Buyer links use opaque random tokens. The database stores only a SHA-256 hash.
- The API uses the Supabase service role key and must run server-side only.
- Public receipt responses mask phone numbers and never expose seller internal notes.
- Buyer confirmation and proof creation happen inside a Supabase RPC transaction.
