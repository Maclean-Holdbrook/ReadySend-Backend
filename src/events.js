import { supabase } from './supabase.js';

export async function logOrderEvent({ orderId, sellerId, eventName, metadata = {} }) {
  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    seller_id: sellerId,
    event_name: eventName,
    metadata
  });

  if (error) {
    console.error('Failed to record order event', {
      orderId,
      sellerId,
      eventName,
      message: error.message
    });
  }
}
