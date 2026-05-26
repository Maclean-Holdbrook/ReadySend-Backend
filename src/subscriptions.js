import { badRequest } from './errors.js';
import { supabase } from './supabase.js';

export const planLimits = {
  free: 15,
  pro: 150,
  growth: 500
};

export async function getSellerSubscription(sellerId) {
  const { data, error } = await supabase
    .from('seller_subscriptions')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return {
      subscription: null,
      effectivePlan: 'free',
      orderLimit: planLimits.free,
      canCreateOrders: true
    };
  }

  if (error) throw badRequest('subscription_lookup_failed', error.message);

  if (!data) {
    return {
      subscription: null,
      effectivePlan: 'free',
      orderLimit: planLimits.free,
      canCreateOrders: true
    };
  }

  const expired = data.status === 'active' && new Date(data.current_period_end).getTime() < Date.now();
  if (expired) {
    const { data: updated, error: updateError } = await supabase
      .from('seller_subscriptions')
      .update({ status: 'expired' })
      .eq('id', data.id)
      .select()
      .single();

    if (updateError) throw badRequest('subscription_expire_failed', updateError.message);

    return {
      subscription: updated,
      effectivePlan: 'expired',
      orderLimit: 0,
      canCreateOrders: false
    };
  }

  if (data.status !== 'active') {
    return {
      subscription: data,
      effectivePlan: data.status,
      orderLimit: 0,
      canCreateOrders: false
    };
  }

  return {
    subscription: data,
    effectivePlan: data.plan_key,
    orderLimit: data.order_limit,
    canCreateOrders: true
  };
}

export async function assertMonthlyOrderLimit(sellerId) {
  const status = await getSellerSubscription(sellerId);
  if (!status.canCreateOrders) {
    throw badRequest('subscription_required', 'Your subscription has ended. Renew Pro or Growth to continue creating orders.');
  }

  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .gte('created_at', periodStart.toISOString());

  if (error) throw badRequest('order_limit_check_failed', error.message);

  if ((count || 0) >= status.orderLimit) {
    throw badRequest(
      'monthly_order_limit_reached',
      `You have reached the ${status.effectivePlan} plan limit of ${status.orderLimit} orders this month.`
    );
  }

  return status;
}
