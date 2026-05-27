-- Enable Row Level Security for ReadySend production hardening.
--
-- ReadySend uses a custom backend session system, not Supabase Auth sessions.
-- The frontend should never query Supabase tables directly. All app access goes
-- through the backend with the Supabase service role key, which bypasses RLS.
--
-- Therefore, these tables intentionally have no anon/authenticated policies:
-- direct client access is denied by default once RLS is enabled.

alter table public.sellers enable row level security;
alter table public.orders enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.confirmation_proofs enable row level security;
alter table public.order_events enable row level security;
alter table public.buyer_order_requests enable row level security;
alter table public.seller_subscriptions enable row level security;
alter table public.payments enable row level security;

-- Remove direct table access for browser/API roles. The backend service role is
-- expected to remain the only application path to these tables.
revoke all on table public.sellers from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.seller_accounts from anon, authenticated;
revoke all on table public.confirmation_proofs from anon, authenticated;
revoke all on table public.order_events from anon, authenticated;
revoke all on table public.buyer_order_requests from anon, authenticated;
revoke all on table public.seller_subscriptions from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

-- These helper functions are called only by backend/service-role code or by
-- triggers. Do not expose them to direct anon/authenticated API calls.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.confirm_order_with_proof(text, text, text, text) from public, anon, authenticated;

-- Make the intended backend access path explicit.
grant execute on function public.confirm_order_with_proof(text, text, text, text) to service_role;
