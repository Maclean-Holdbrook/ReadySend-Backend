import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../errors.js';
import { getSellerSubscription } from '../subscriptions.js';
import { supabase } from '../supabase.js';

export const billingRouter = Router();
export const paystackWebhookRouter = Router();

const plans = {
  pro: {
    name: 'Pro',
    amount: 3900,
    currency: 'GHS',
    orderLimit: 150,
    envPlanCode: 'PAYSTACK_PRO_PLAN_CODE'
  },
  growth: {
    name: 'Growth',
    amount: 8900,
    currency: 'GHS',
    orderLimit: 500,
    envPlanCode: 'PAYSTACK_GROWTH_PLAN_CODE'
  }
};

const checkoutSchema = z.object({
  sellerId: z.string().uuid(),
  plan: z.enum(['pro', 'growth'])
});

function requirePaystackKey() {
  if (!config.paystackSecretKey) {
    throw badRequest('paystack_not_configured', 'Paystack secret key is not configured.');
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

async function paystackRequest(path, options = {}) {
  requirePaystackKey();

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.paystackSecretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    throw badRequest('paystack_request_failed', payload.message || 'Paystack request failed.');
  }

  return payload;
}

async function activateSubscription({ sellerId, planKey, reference, paystackData }) {
  const plan = plans[planKey];
  const now = new Date();
  const periodEnd = addMonths(now, 1);

  await supabase.from('payments').upsert(
    {
      seller_id: sellerId,
      plan_key: planKey,
      provider: 'paystack',
      provider_reference: reference,
      amount: plan.amount,
      currency: plan.currency,
      status: 'paid',
      provider_payload: paystackData || {}
    },
    { onConflict: 'provider_reference' }
  );

  const { error } = await supabase.from('seller_subscriptions').upsert(
    {
      seller_id: sellerId,
      plan_key: planKey,
      plan_name: plan.name,
      status: 'active',
      provider: 'paystack',
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

    const planCode = process.env[plan.envPlanCode];
    const body = {
      email: account.email,
      amount: String(plan.amount),
      currency: plan.currency,
      reference,
      callback_url: `${config.webAppUrl}/#dashboard`,
      metadata: {
        sellerId: input.sellerId,
        plan: input.plan,
        businessName: account.sellers?.business_name || ''
      }
    };

    if (planCode) {
      body.plan = planCode;
    }

    const payload = await paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    await supabase.from('payments').insert({
      seller_id: input.sellerId,
      plan_key: input.plan,
      provider: 'paystack',
      provider_reference: reference,
      amount: plan.amount,
      currency: plan.currency,
      status: 'initialized',
      provider_payload: payload.data || {}
    });

    res.status(201).json({
      authorizationUrl: payload.data.authorization_url,
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
    const payload = await paystackRequest(`/transaction/verify/${encodeURIComponent(req.params.reference)}`);
    const data = payload.data;

    if (data?.status === 'success') {
      const sellerId = data.metadata?.sellerId;
      const planKey = data.metadata?.plan;
      if (sellerId && plans[planKey]) {
        await activateSubscription({ sellerId, planKey, reference: data.reference, paystackData: data });
      }
    }

    res.json({ status: data?.status || 'unknown', reference: data?.reference || req.params.reference });
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
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw badRequest('payment_lookup_failed', error.message);
    if (!payment) throw badRequest('payment_not_found', 'No Paystack payment has been started for this seller.');

    const payload = await paystackRequest(`/transaction/verify/${encodeURIComponent(payment.provider_reference)}`);
    const data = payload.data;

    if (data?.status === 'success') {
      const planKey = data.metadata?.plan || payment.plan_key;
      if (plans[planKey]) {
        await activateSubscription({ sellerId, planKey, reference: data.reference, paystackData: data });
      }
    } else {
      await supabase
        .from('payments')
        .update({ status: data?.status === 'failed' ? 'failed' : payment.status, provider_payload: data || {} })
        .eq('id', payment.id);
    }

    const subscriptionStatus = await getSellerSubscription(sellerId);

    res.json({
      paymentStatus: data?.status || 'unknown',
      reference: data?.reference || payment.provider_reference,
      ...subscriptionStatus
    });
  } catch (error) {
    next(error);
  }
});

paystackWebhookRouter.post('/', async (req, res, next) => {
  try {
    requirePaystackKey();
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512', config.paystackSecretKey).update(req.body).digest('hex');

    if (!signature || signature !== hash) {
      throw badRequest('invalid_paystack_signature', 'Invalid Paystack webhook signature.');
    }

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'charge.success') {
      const data = event.data;
      const sellerId = data.metadata?.sellerId;
      const planKey = data.metadata?.plan;

      if (sellerId && plans[planKey]) {
        await activateSubscription({ sellerId, planKey, reference: data.reference, paystackData: data });
      }
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});
