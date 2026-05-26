import { badRequest, notFound } from './errors.js';
import { logOrderEvent } from './events.js';
import { toPublicReceipt } from './formatters.js';
import { supabase } from './supabase.js';
import { hashConfirmationToken } from './tokens.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function paymentLabel(value) {
  const labels = {
    unpaid: 'Unpaid',
    part_paid: 'Part paid',
    paid: 'Paid',
    pay_on_delivery: 'Pay on delivery'
  };
  return labels[value] || value;
}

export async function fetchPublicReceipt(token) {
  const tokenHash = hashConfirmationToken(token);
  const { data, error } = await supabase
    .from('orders')
    .select('*, sellers(*), confirmation_proofs(*)')
    .eq('confirmation_token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw badRequest('receipt_fetch_failed', error.message);
  }

  if (!data) {
    throw notFound('Confirmation receipt not found.');
  }

  await logOrderEvent({
    orderId: data.id,
    sellerId: data.seller_id,
    eventName: 'receipt_opened'
  });

  return toPublicReceipt(data, data.sellers, data.confirmation_proofs?.[0] || null);
}

export async function confirmReceiptToken(token, input) {
  const tokenHash = hashConfirmationToken(token);
  const { data, error } = await supabase.rpc('confirm_order_with_proof', {
    p_token_hash: tokenHash,
    p_buyer_name: input.buyerName || null,
    p_buyer_phone: input.buyerPhone || null,
    p_delivery_address: input.deliveryAddress || null
  });

  return { data, error };
}

export function renderReceiptPage(receipt, token) {
  const order = receipt.order;
  const seller = receipt.seller;
  const confirmed = order.confirmationStatus === 'confirmed';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ReadySend Order Confirmation</title>
    <style>
      :root { color: #10211a; background: #f7f6f0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      main { width: min(720px, 100%); border: 1px solid rgba(16, 33, 26, 0.12); border-radius: 10px; background: #fff; box-shadow: 0 24px 70px rgba(16, 33, 26, 0.12); overflow: hidden; }
      header { padding: 28px; background: #10211a; color: #fff; }
      header span { display: block; color: #9ed8c3; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; }
      h1 { margin: 8px 0 0; font-size: clamp(1.8rem, 6vw, 3rem); line-height: 1; }
      section { padding: 24px 28px; border-bottom: 1px solid rgba(16, 33, 26, 0.1); }
      dl { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 0; }
      dt { color: #607068; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; }
      dd { margin: 5px 0 0; color: #10211a; font-size: 1rem; font-weight: 700; }
      .notice { color: #526158; line-height: 1.65; }
      .status { display: inline-flex; margin-top: 14px; border-radius: 999px; padding: 8px 12px; background: ${confirmed ? '#e8f8ee' : '#fff5d8'}; color: ${confirmed ? '#12644f' : '#7a5700'}; font-weight: 800; }
      form { display: grid; gap: 12px; }
      input, textarea { width: 100%; min-height: 44px; border: 1px solid rgba(16, 33, 26, 0.16); border-radius: 8px; padding: 10px 12px; font: inherit; }
      textarea { min-height: 84px; resize: vertical; }
      button { min-height: 46px; border: 0; border-radius: 8px; background: #12644f; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
      footer { padding: 20px 28px; color: #68746e; font-size: 0.9rem; line-height: 1.5; }
      @media (max-width: 560px) { dl { grid-template-columns: 1fr; } body { padding: 14px; } section, header, footer { padding-inline: 18px; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <span>ReadySend buyer receipt</span>
        <h1>Confirm your order from ${escapeHtml(seller.businessName)}</h1>
        <div class="status">${confirmed ? 'Order confirmed' : 'Waiting for buyer confirmation'}</div>
      </header>
      <section>
        <dl>
          <div><dt>Product</dt><dd>${escapeHtml(order.productName)}</dd></div>
          <div><dt>Variation</dt><dd>${escapeHtml(order.productVariation || 'Not specified')}</dd></div>
          <div><dt>Quantity</dt><dd>${escapeHtml(order.quantity)}</dd></div>
          <div><dt>Amount</dt><dd>${escapeHtml(order.currency)} ${escapeHtml(order.amount)}</dd></div>
          <div><dt>Delivery area</dt><dd>${escapeHtml(order.deliveryArea)}</dd></div>
          <div><dt>Delivery date</dt><dd>${escapeHtml(order.deliveryDate)}</dd></div>
          <div><dt>Payment terms</dt><dd>${escapeHtml(paymentLabel(order.paymentTerms))}</dd></div>
          <div><dt>Buyer phone number</dt><dd>${escapeHtml(order.buyerPhone)}</dd></div>
        </dl>
      </section>
      <section>
        <p class="notice">Check the order details before the seller dispatches the item. ReadySend helps this seller confirm order details. ReadySend does not verify sellers or hold payment.</p>
        ${confirmed ? '' : `<form method="post" action="/receipt/${encodeURIComponent(token)}/confirm">
          <input name="buyerName" value="${escapeHtml(order.buyerName)}" placeholder="Your name" />
          <input name="buyerPhone" placeholder="Your phone number" />
          <textarea name="deliveryAddress" placeholder="Delivery address or extra delivery note">${escapeHtml(order.deliveryAddress || '')}</textarea>
          <button type="submit">Confirm this order</button>
        </form>`}
      </section>
      <footer>Seller contact shown on this receipt is masked for privacy. Continue the conversation where the seller sent you this link.</footer>
    </main>
  </body>
</html>`;
}

export function renderReceiptErrorPage(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ReadySend Confirmation Error</title>
    <style>
      :root { color: #10211a; background: #f7f6f0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      main { width: min(560px, 100%); border-radius: 10px; background: #fff; box-shadow: 0 24px 70px rgba(16, 33, 26, 0.12); padding: 28px; }
      h1 { margin: 0 0 12px; font-size: 2rem; }
      p { color: #526158; line-height: 1.65; }
      a { display: inline-flex; min-height: 44px; align-items: center; border-radius: 8px; background: #12644f; color: #fff; padding: 0 16px; text-decoration: none; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <h1>Could not confirm this order</h1>
      <p>${escapeHtml(message)}</p>
      <a href="javascript:history.back()">Go back</a>
    </main>
  </body>
</html>`;
}
