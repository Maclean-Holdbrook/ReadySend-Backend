import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { sendEmail } from '../email.js';
import { badRequest, notFound } from '../errors.js';
import { logOrderEvent } from '../events.js';
import { toOrderResponse } from '../formatters.js';
import { assertMonthlyOrderLimit } from '../subscriptions.js';
import { supabase } from '../supabase.js';
import { createConfirmationToken, getConfirmationExpiry, hashConfirmationToken } from '../tokens.js';
import { createOrderSchema, publicBuyerRequestSchema, sellerScopedSchema } from '../validation.js';

export const buyerRequestsRouter = Router();
export const publicBuyerRequestsRouter = Router();

function toBuyerRequestResponse(data) {
  return {
    id: data.id,
    sellerId: data.seller_id,
    buyerName: data.buyer_name,
    buyerPhone: data.buyer_phone,
    productName: data.product_name,
    productVariation: data.product_variation,
    quantity: data.quantity,
    amount: data.amount,
    currency: data.currency,
    deliveryArea: data.delivery_area,
    deliveryAddress: data.delivery_address,
    deliveryDate: data.delivery_date,
    paymentTerms: data.payment_terms,
    internalNotes: data.internal_notes,
    status: data.status,
    linkedOrderId: data.linked_order_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

function toPublicSeller(data) {
  return {
    id: data.id,
    businessName: data.business_name,
    category: data.category,
    mainChannel: data.main_channel,
    sellerSlug: data.seller_slug
  };
}

async function sendBuyerRequestNotification({ seller, request }) {
  const { data: account, error } = await supabase
    .from('seller_accounts')
    .select('email')
    .eq('seller_id', seller.id)
    .maybeSingle();

  if (error) throw badRequest('seller_email_lookup_failed', error.message);
  if (!account?.email) return null;

  const dashboardUrl = `${config.webAppUrl}/#dashboard`;
  return sendEmail({
    to: account.email,
    subject: `New ReadySend order request from ${request.buyer_name}`,
    text: [
      `Hi ${seller.business_name},`,
      '',
      'You have received a new buyer order request on ReadySend.',
      '',
      `Buyer: ${request.buyer_name}`,
      `Phone: ${request.buyer_phone}`,
      `Product: ${request.product_name}`,
      `Variation: ${request.product_variation || 'Not provided'}`,
      `Quantity: ${request.quantity}`,
      `Amount: ${request.currency} ${request.amount}`,
      `Delivery area: ${request.delivery_area}`,
      `Payment terms: ${request.payment_terms}`,
      '',
      `Open your dashboard to review, edit, approve, or reject it: ${dashboardUrl}`
    ].join('\n')
  });
}

async function createOrderFromInput(input) {
  await assertMonthlyOrderLimit(input.sellerId);

  const token = createConfirmationToken();
  const tokenHash = hashConfirmationToken(token);
  const confirmationUrl = `${config.appBaseUrl}/receipt/${token}`;

  const { data, error } = await supabase
    .from('orders')
    .insert({
      seller_id: input.sellerId,
      buyer_name: input.buyerName,
      buyer_phone: input.buyerPhone,
      product_name: input.productName,
      product_variation: input.productVariation || null,
      quantity: input.quantity,
      amount: input.amount,
      currency: input.currency,
      delivery_area: input.deliveryArea,
      delivery_address: input.deliveryAddress || null,
      delivery_date: input.deliveryDate,
      payment_terms: input.paymentTerms,
      internal_notes: input.internalNotes || null,
      confirmation_token_hash: tokenHash,
      confirmation_url: confirmationUrl,
      confirmation_expires_at: getConfirmationExpiry(input.deliveryDate)
    })
    .select()
    .single();

  if (error) throw badRequest('order_create_failed', error.message);

  await logOrderEvent({
    orderId: data.id,
    sellerId: data.seller_id,
    eventName: 'order_created_from_buyer_request'
  });

  return toOrderResponse(data, confirmationUrl);
}

publicBuyerRequestsRouter.get('/sellers/:slug', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('sellers')
      .select('id, business_name, category, main_channel, seller_slug')
      .eq('seller_slug', req.params.slug)
      .maybeSingle();

    if (error) throw badRequest('seller_lookup_failed', error.message);
    if (!data) throw notFound('Seller not found.');

    res.json({ seller: toPublicSeller(data) });
  } catch (error) {
    next(error);
  }
});

publicBuyerRequestsRouter.post('/sellers/:slug/requests', async (req, res, next) => {
  try {
    const input = publicBuyerRequestSchema.parse(req.body);
    const { data: seller, error: sellerError } = await supabase
      .from('sellers')
      .select('id, business_name')
      .eq('seller_slug', req.params.slug)
      .maybeSingle();

    if (sellerError) throw badRequest('seller_lookup_failed', sellerError.message);
    if (!seller) throw notFound('Seller not found.');

    const { data, error } = await supabase
      .from('buyer_order_requests')
      .insert({
        seller_id: seller.id,
        buyer_name: input.buyerName,
        buyer_phone: input.buyerPhone,
        product_name: input.productName,
        product_variation: input.productVariation || null,
        quantity: input.quantity,
        amount: input.amount,
        currency: input.currency,
        delivery_area: input.deliveryArea,
        delivery_address: input.deliveryAddress || null,
        delivery_date: input.deliveryDate,
        payment_terms: input.paymentTerms,
        internal_notes: input.internalNotes || null
      })
      .select()
      .single();

    if (error) throw badRequest('buyer_request_create_failed', error.message);

    sendBuyerRequestNotification({ seller, request: data }).catch((emailError) => {
      console.error('Buyer request notification failed', {
        sellerId: seller.id,
        requestId: data.id,
        message: emailError.message
      });
    });

    res.status(201).json({ request: toBuyerRequestResponse(data) });
  } catch (error) {
    next(error);
  }
});

buyerRequestsRouter.get('/', async (req, res, next) => {
  try {
    const { sellerId } = sellerScopedSchema.parse(req.query);
    const { data, error } = await supabase
      .from('buyer_order_requests')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) throw badRequest('buyer_requests_fetch_failed', error.message);
    res.json({ requests: data.map(toBuyerRequestResponse) });
  } catch (error) {
    next(error);
  }
});

const actionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  order: createOrderSchema.optional()
});

buyerRequestsRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = actionSchema.parse(req.body);

    const { data: existing, error: fetchError } = await supabase
      .from('buyer_order_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchError) throw badRequest('buyer_request_fetch_failed', fetchError.message);
    if (!existing) throw notFound('Buyer request not found.');
    if (existing.status !== 'pending') throw badRequest('buyer_request_not_pending', 'This request has already been handled.');

    if (input.action === 'reject') {
      const { data, error } = await supabase
        .from('buyer_order_requests')
        .update({ status: 'rejected' })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw badRequest('buyer_request_reject_failed', error.message);
      res.json({ request: toBuyerRequestResponse(data) });
      return;
    }

    const orderInput = createOrderSchema.parse(input.order || {
      sellerId: existing.seller_id,
      buyerName: existing.buyer_name,
      buyerPhone: existing.buyer_phone,
      productName: existing.product_name,
      productVariation: existing.product_variation || '',
      quantity: existing.quantity,
      amount: existing.amount,
      currency: existing.currency,
      deliveryArea: existing.delivery_area,
      deliveryAddress: existing.delivery_address || '',
      deliveryDate: existing.delivery_date,
      paymentTerms: existing.payment_terms,
      internalNotes: existing.internal_notes || ''
    });

    if (orderInput.sellerId !== existing.seller_id) {
      throw badRequest('seller_mismatch', 'Buyer request seller does not match order seller.');
    }

    const order = await createOrderFromInput(orderInput);
    const { data, error } = await supabase
      .from('buyer_order_requests')
      .update({ status: 'approved', linked_order_id: order.id })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw badRequest('buyer_request_approve_failed', error.message);
    res.json({ request: toBuyerRequestResponse(data), order });
  } catch (error) {
    next(error);
  }
});
