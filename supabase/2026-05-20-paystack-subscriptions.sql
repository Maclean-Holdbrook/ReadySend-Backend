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

drop trigger if exists seller_subscriptions_touch_updated_at on public.seller_subscriptions;
create trigger seller_subscriptions_touch_updated_at
before update on public.seller_subscriptions
for each row execute function public.touch_updated_at();

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();
