create or replace function public.confirm_order_with_proof(
  p_token_hash text,
  p_buyer_name text default null,
  p_buyer_phone text default null,
  p_delivery_address text default null
)
returns table(order_id uuid, proof_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_proof_id uuid;
begin
  select * into v_order
  from public.orders
  where confirmation_token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invalid_confirmation_token' using errcode = 'P0001';
  end if;

  if v_order.confirmation_expires_at < now() then
    update public.orders
    set confirmation_status = 'expired'
    where public.orders.id = v_order.id;
    raise exception 'confirmation_token_expired' using errcode = 'P0001';
  end if;

  if v_order.confirmation_status = 'cancelled' then
    raise exception 'order_cancelled' using errcode = 'P0001';
  end if;

  if v_order.confirmation_status = 'confirmed' then
    select public.confirmation_proofs.id into v_proof_id
    from public.confirmation_proofs
    where public.confirmation_proofs.order_id = v_order.id;

    return query select v_order.id, v_proof_id, 'already_confirmed'::text;
    return;
  end if;

  update public.orders
  set
    confirmation_status = 'confirmed',
    buyer_name = coalesce(nullif(trim(p_buyer_name), ''), public.orders.buyer_name),
    buyer_phone = coalesce(nullif(trim(p_buyer_phone), ''), public.orders.buyer_phone),
    delivery_address = coalesce(nullif(trim(p_delivery_address), ''), public.orders.delivery_address)
  where public.orders.id = v_order.id
  returning * into v_order;

  insert into public.confirmation_proofs (
    order_id,
    seller_id,
    buyer_name,
    buyer_phone,
    product_name,
    product_variation,
    quantity,
    amount,
    currency,
    delivery_area,
    delivery_address,
    delivery_date,
    payment_terms
  )
  values (
    v_order.id,
    v_order.seller_id,
    v_order.buyer_name,
    v_order.buyer_phone,
    v_order.product_name,
    v_order.product_variation,
    v_order.quantity,
    v_order.amount,
    v_order.currency,
    v_order.delivery_area,
    v_order.delivery_address,
    v_order.delivery_date,
    v_order.payment_terms
  )
  returning public.confirmation_proofs.id into v_proof_id;

  insert into public.order_events(order_id, seller_id, event_name, metadata)
  values (v_order.id, v_order.seller_id, 'buyer_confirmed', '{}'::jsonb);

  return query select v_order.id, v_proof_id, 'confirmed'::text;
end;
$$;
