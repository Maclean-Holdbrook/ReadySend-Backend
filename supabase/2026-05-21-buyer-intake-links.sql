alter table public.sellers
add column if not exists seller_slug text;

create unique index if not exists idx_sellers_seller_slug on public.sellers(seller_slug);

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

create index if not exists idx_buyer_order_requests_seller_status_created
on public.buyer_order_requests(seller_id, status, created_at desc);

drop trigger if exists buyer_order_requests_touch_updated_at on public.buyer_order_requests;
create trigger buyer_order_requests_touch_updated_at
before update on public.buyer_order_requests
for each row execute function public.touch_updated_at();
