import { Router } from 'express';
import { config } from '../config.js';
import { badRequest, notFound } from '../errors.js';
import { logOrderEvent } from '../events.js';
import { toOrderResponse } from '../formatters.js';
import { assertMonthlyOrderLimit } from '../subscriptions.js';
import { supabase } from '../supabase.js';
import { createConfirmationToken, getConfirmationExpiry, hashConfirmationToken } from '../tokens.js';
import { createOrderSchema, readinessSchema, sellerScopedSchema } from '../validation.js';

export const ordersRouter = Router();

ordersRouter.post('/', async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    await assertMonthlyOrderLimit(input.sellerId);
    const token = createConfirmationToken();
    const tokenHash = hashConfirmationToken(token);
    const confirmationExpiresAt = getConfirmationExpiry(input.deliveryDate);
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
        confirmation_expires_at: confirmationExpiresAt
      })
      .select()
      .single();

    if (error) {
      throw badRequest('order_create_failed', error.message);
    }

    await logOrderEvent({
      orderId: data.id,
      sellerId: data.seller_id,
      eventName: 'order_created'
    });

    res.status(201).json({
      order: toOrderResponse(data, confirmationUrl)
    });
  } catch (error) {
    next(error);
  }
});

ordersRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);

    const { data, error } = await supabase
      .from('orders')
      .update({
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
      .eq('id', req.params.id)
      .eq('seller_id', input.sellerId)
      .neq('confirmation_status', 'confirmed')
      .select()
      .maybeSingle();

    if (error) {
      throw badRequest('order_update_failed', error.message);
    }

    if (!data) {
      throw notFound('Order not found or already confirmed.');
    }

    await logOrderEvent({
      orderId: data.id,
      sellerId: data.seller_id,
      eventName: 'order_updated'
    });

    res.json({ order: toOrderResponse(data) });
  } catch (error) {
    next(error);
  }
});

ordersRouter.get('/', async (req, res, next) => {
  try {
    const { sellerId } = sellerScopedSchema.parse(req.query);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw badRequest('orders_fetch_failed', error.message);
    }

    res.json({ orders: data.map((order) => toOrderResponse(order)) });
  } catch (error) {
    next(error);
  }
});

ordersRouter.get('/:id', async (req, res, next) => {
  try {
    const { sellerId } = sellerScopedSchema.parse(req.query);
    const { data, error } = await supabase
      .from('orders')
      .select('*, confirmation_proofs(*)')
      .eq('id', req.params.id)
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (error) {
      throw badRequest('order_fetch_failed', error.message);
    }

    if (!data) {
      throw notFound('Order not found.');
    }

    res.json({
      order: toOrderResponse(data),
      proof: data.confirmation_proofs?.[0] || null
    });
  } catch (error) {
    next(error);
  }
});

ordersRouter.patch('/:id/readiness', async (req, res, next) => {
  try {
    const input = readinessSchema.parse(req.body);

    const { data, error } = await supabase
      .from('orders')
      .update({ package_ready: input.packageReady })
      .eq('id', req.params.id)
      .eq('seller_id', input.sellerId)
      .select()
      .maybeSingle();

    if (error) {
      throw badRequest('readiness_update_failed', error.message);
    }

    if (!data) {
      throw notFound('Order not found.');
    }

    await logOrderEvent({
      orderId: data.id,
      sellerId: data.seller_id,
      eventName: input.packageReady ? 'package_ready' : 'package_not_ready'
    });

    res.json({ order: toOrderResponse(data) });
  } catch (error) {
    next(error);
  }
});

ordersRouter.post('/:id/reminder-copy', async (req, res, next) => {
  try {
    const { sellerId } = sellerScopedSchema.parse(req.body);

    const { data, error } = await supabase
      .from('orders')
      .select('*, sellers(*)')
      .eq('id', req.params.id)
      .eq('seller_id', sellerId)
      .maybeSingle();

    if (error) {
      throw badRequest('reminder_copy_failed', error.message);
    }

    if (!data) {
      throw notFound('Order not found.');
    }

    await logOrderEvent({
      orderId: data.id,
      sellerId: data.seller_id,
      eventName: 'confirmation_link_copied'
    });

    res.json({
      message: `Hi ${data.buyer_name}, please confirm your ${data.product_name} order from ${data.sellers.business_name} before dispatch. Open your ReadySend confirmation link to check the item, delivery details, and payment terms.`
    });
  } catch (error) {
    next(error);
  }
});
