create table if not exists public.seller_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.sellers(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_seller_accounts_email on public.seller_accounts(lower(email));

drop trigger if exists seller_accounts_touch_updated_at on public.seller_accounts;
create trigger seller_accounts_touch_updated_at
before update on public.seller_accounts
for each row execute function public.touch_updated_at();
