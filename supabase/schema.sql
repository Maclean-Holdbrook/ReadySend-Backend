create extension if not exists "pgcrypto";

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  whatsapp_phone text not null,
  category text not null check (category in ('clothing', 'beauty', 'food', 'accessories', 'other')),
  main_channel text not null check (main_channel in ('whatsapp', 'instagram', 'tiktok', 'other')),
  logo_url text,
  seller_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  buyer_name text not null,
  buyer_phone text not null,
  product_name text not null,
  product_variation text,
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'GHS',
  delivery_area text not null,
  delivery_address text,
  delivery_date date not null,
  payment_terms text not null check (payment_terms in ('unpaid', 'part_paid', 'paid', 'pay_on_delivery')),
  internal_notes text,
  confirmation_status text not null default 'awaiting' check (confirmation_status in ('awaiting', 'confirmed', 'cancelled', 'expired')),
  package_ready boolean not null default false,
  fulfillment_status text not null default 'not_dispatched' check (fulfillment_status in ('not_dispatched', 'dispatched', 'delivered', 'returned', 'cancelled')),
  confirmation_token_hash text not null unique,
  confirmation_url text,
  confirmation_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.sellers(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.confirmation_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  buyer_name text not null,
  buyer_phone text not null,
  product_name text not null,
  product_variation text,
  quantity integer not null,
  amount numeric(12, 2) not null,
  currency text not null,
  delivery_area text not null,
  delivery_address text,
  delivery_date date not null,
  payment_terms text not null,
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 months')
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  seller_id uuid references public.sellers(id) on delete cascade,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.buyer_order_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  buyer_name text not null,
  buyer_phone text not null,
  product_name text not null,
  product_variation text,
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'GHS',
  delivery_area text not null,
  delivery_address text,
  delivery_date date not null,
  payment_terms text not null check (payment_terms in ('unpaid', 'part_paid', 'paid', 'pay_on_delivery')),
  internal_notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  linked_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_subscriptions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.sellers(id) on delete cascade,
  plan_key text not null check (plan_key in ('free', 'pro', 'growth')),
  plan_name text not null,
  status text not null check (status in ('active', 'past_due', 'cancelled', 'expired')),
  provider text not null default 'paystack',
  provider_reference text,
  order_limit integer not null,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  plan_key text not null check (plan_key in ('pro', 'growth')),
  provider text not null default 'paystack',
  provider_reference text not null unique,
  amount integer not null,
  currency text not null default 'GHS',
  status text not null check (status in ('initialized', 'paid', 'failed')),
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_seller_created_at on public.orders(seller_id, created_at desc);
create index if not exists idx_orders_seller_confirmation on public.orders(seller_id, confirmation_status);
create index if not exists idx_orders_seller_delivery_date on public.orders(seller_id, delivery_date);
create index if not exists idx_orders_seller_fulfillment on public.orders(seller_id, fulfillment_status);
create index if not exists idx_orders_confirmation_token_hash on public.orders(confirmation_token_hash);
create index if not exists idx_order_events_seller_event_created on public.order_events(seller_id, event_name, created_at desc);
create index if not exists idx_seller_accounts_email on public.seller_accounts(lower(email));
create unique index if not exists idx_sellers_seller_slug on public.sellers(seller_slug);
create index if not exists idx_buyer_order_requests_seller_status_created on public.buyer_order_requests(seller_id, status, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sellers_touch_updated_at on public.sellers;
create trigger sellers_touch_updated_at
before update on public.sellers
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists seller_accounts_touch_updated_at on public.seller_accounts;
create trigger seller_accounts_touch_updated_at
before update on public.seller_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists seller_subscriptions_touch_updated_at on public.seller_subscriptions;
create trigger seller_subscriptions_touch_updated_at
before update on public.seller_subscriptions
for each row execute function public.touch_updated_at();

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();

drop trigger if exists buyer_order_requests_touch_updated_at on public.buyer_order_requests;
create trigger buyer_order_requests_touch_updated_at
before update on public.buyer_order_requests
for each row execute function public.touch_updated_at();

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
    where id = v_order.id;
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
