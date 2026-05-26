alter table public.orders
add column if not exists confirmation_url text;
