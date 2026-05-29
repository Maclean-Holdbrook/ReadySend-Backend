import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../errors.js';
import { getSellerSubscription } from '../subscriptions.js';
import { supabase } from '../supabase.js';

export const billingRouter = Router();
export const flutterwaveWebhookRouter = Router();

const plans = {
  pro: {
    name: 'Pro',
    amount: 39,
    currency: 'GHS',
    orderLimit: 150,
    envPlanId: 'FLUTTERWAVE_PRO_PLAN_ID'
  },
  growth: {
    name: 'Growth',
    amount: 89,
    currency: 'GHS',
    orderLimit: 500,
    envPlanId: 'FLUTTERWAVE_GROWTH_PLAN_ID'
  }
};

const checkoutSchema = z.object({
  sellerId: z.string().uuid(),
  plan: z.enum(['pro', 'growth'])
});

function requireFlutterwaveKey() {
  if (!config.flutterwaveSecretKey) {
    throw badRequest('flutterwave_not_configured', 'Flutterwave secret key is not configured.');
  }
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

function referenceFor(sellerId, plan) {
  const suffix = crypto.randomBytes(8).toString('hex');
  return `RS-${plan}-${sellerId.slice(0, 8)}-${Date.now()}-${suffix}`;
}

async function flutterwaveRequest(path, options = {}) {
  requireFlutterwaveKey();

  const response = await fetch(`https://api.flutterwave.com/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.flutterwaveSecretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === 'error') {
    throw badRequest('flutterwave_request_failed', payload.message || 'Flutterwave request failed.');
  }

  return payload;
}

function metadataFromTransaction(data) {
  return data?.meta || data?.metadata || {};
}

function isMatchingSuccessfulPayment(data, payment) {
  const plan = plans[payment.plan_key];
  return (
    Boolean(plan) &&
    data?.status === 'successful' &&
    data.tx_ref === payment.provider_reference &&
    Number(data.amount) === plan.amount &&
    data.currency === plan.currency
  );
}

async function verifyFlutterwaveReference(reference) {
  const query = new URLSearchParams({ tx_ref: reference });
  const payload = await flutterwaveRequest(`/transactions/verify_by_reference?${query.toString()}`);
  return payload.data;
}

async function verifyFlutterwaveTransaction(id) {
  const payload = await flutterwaveRequest(`/transactions/${encodeURIComponent(id)}/verify`);
  return payload.data;
}

async function activateVerifiedTransaction(data) {
  const reference = data?.tx_ref;
  if (!reference) return false;

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('provider_reference', reference)
    .maybeSingle();

  if (error) throw badRequest('payment_lookup_failed', error.message);
  if (!payment || !isMatchingSuccessfulPayment(data, payment)) return false;

  const meta = metadataFromTransaction(data);
  const planKey = meta.plan || payment.plan_key;
  if (!plans[planKey]) return false;

  await activateSubscription({
    sellerId: payment.seller_id,
    planKey,
    reference,
    providerData: data
  });
  return true;
}

async function activateSubscription({ sellerId, planKey, reference, providerData }) {
  const plan = plans[planKey];
  const now = new Date();
  const periodEnd = addMonths(now, 1);

  await supabase.from('payments').upsert(
    {
      seller_id: sellerId,
      plan_key: planKey,
      provider: 'flutterwave',
      provider_reference: reference,
      amount: plan.amount,
      currency: plan.currency,
      status: 'paid',
      provider_payload: providerData || {}
    },
    { onConflict: 'provider_reference' }
  );

  const { error } = await supabase.from('seller_subscriptions').upsert(
    {
      seller_id: sellerId,
      plan_key: planKey,
      plan_name: plan.name,
      status: 'active',
      provider: 'flutterwave',
      provider_reference: reference,
      order_limit: plan.orderLimit,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd
    },
    { onConflict: 'seller_id' }
  );

  if (error) {
    throw badRequest('subscription_update_failed', error.message);
  }
}

billingRouter.post('/checkout', async (req, res, next) => {
  try {
    const input = checkoutSchema.parse(req.body);
    const plan = plans[input.plan];
    const reference = referenceFor(input.sellerId, input.plan);

    const { data: account, error } = await supabase
      .from('seller_accounts')
      .select('email, sellers(business_name)')
      .eq('seller_id', input.sellerId)
      .maybeSingle();

    if (error) throw badRequest('seller_account_lookup_failed', error.message);
    if (!account) throw badRequest('seller_account_not_found', 'Seller account not found.');

    const body = {
      tx_ref: reference,
      amount: plan.amount,
      currency: plan.currency,
      redirect_url: `${config.webAppUrl}/#dashboard`,
      payment_options: 'card,mobilemoneyghana',
      meta: {
        sellerId: input.sellerId,
        plan: input.plan,
        expectedAmount: plan.amount,
        businessName: account.sellers?.business_name || ''
      },
      customer: {
        email: account.email,
        name: account.sellers?.business_name || 'ReadySend seller'
      },
      customizations: {
        title: 'ReadySend',
        description: `${plan.name} monthly subscription`
      }
    };

    const planId = process.env[plan.envPlanId];
    const numericPlanId = Number(planId);
    if (Number.isFinite(numericPlanId) && numericPlanId > 0) {
      body.payment_plan = numericPlanId;
    }

    const payload = await flutterwaveRequest('/payments', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    await supabase.from('payments').insert({
      seller_id: input.sellerId,
      plan_key: input.plan,
      provider: 'flutterwave',
      provider_reference: reference,
      amount: plan.amount,
      currency: plan.currency,
      status: 'initialized',
      provider_payload: payload.data || {}
    });

    res.status(201).json({
      authorizationUrl: payload.data.link,
      reference,
      plan: {
        key: input.plan,
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency
      }
    });
  } catch (error) {
    next(error);
  }
});

billingRouter.get('/subscription', async (req, res, next) => {
  try {
    const { sellerId } = z.object({ sellerId: z.string().uuid() }).parse(req.query);
    const status = await getSellerSubscription(sellerId);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

billingRouter.get('/verify/:reference', async (req, res, next) => {
  try {
    const data = await verifyFlutterwaveReference(req.params.reference);

    await activateVerifiedTransaction(data);

    res.json({ status: data?.status || 'unknown', reference: data?.tx_ref || req.params.reference });
  } catch (error) {
    next(error);
  }
});

billingRouter.post('/verify-latest', async (req, res, next) => {
  try {
    const { sellerId } = z.object({ sellerId: z.string().uuid() }).parse(req.body);
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('seller_id', sellerId)
      .eq('provider', 'flutterwave')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw badRequest('payment_lookup_failed', error.message);
    if (!payment) throw badRequest('payment_not_found', 'No Flutterwave payment has been started for this seller.');

    const data = await verifyFlutterwaveReference(payment.provider_reference);

    if (isMatchingSuccessfulPayment(data, payment)) {
      await activateVerifiedTransaction(data);
    } else {
      await supabase
        .from('payments')
        .update({ status: data?.status === 'failed' ? 'failed' : payment.status, provider_payload: data || {} })
        .eq('id', payment.id);
    }

    const subscriptionStatus = await getSellerSubscription(sellerId);

    res.json({
      paymentStatus: data?.status || 'unknown',
      reference: data?.tx_ref || payment.provider_reference,
      ...subscriptionStatus
    });
  } catch (error) {
    next(error);
  }
});

flutterwaveWebhookRouter.post('/', async (req, res, next) => {
  try {
    requireFlutterwaveKey();
    const signature = req.headers['verif-hash'];

    if (config.flutterwaveWebhookHash && signature !== config.flutterwaveWebhookHash) {
      throw badRequest('invalid_flutterwave_signature', 'Invalid Flutterwave webhook signature.');
    }

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'charge.completed' && event.data?.id) {
      const data = await verifyFlutterwaveTransaction(event.data.id);
      await activateVerifiedTransaction(data);
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});
