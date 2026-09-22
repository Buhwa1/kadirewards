-- ============================================================================
-- Kadi — 0003: row level security
-- Everything a logged-in owner/manager touches goes through RLS.
-- The till and the public customer card go through service-role API routes
-- instead, because they are not authenticated as a Supabase user.
-- ============================================================================

-- is_member() / is_owner() are defined in 0002 — the security-definer
-- functions there guard themselves with them.

alter table public.businesses          enable row level security;
alter table public.business_members    enable row level security;
alter table public.staff               enable row level security;
alter table public.staff_secrets       enable row level security;
alter table public.business_whatsapp   enable row level security;
alter table public.programs            enable row level security;
alter table public.tiers               enable row level security;
alter table public.customers           enable row level security;
alter table public.rewards             enable row level security;
alter table public.transactions        enable row level security;
alter table public.campaigns           enable row level security;
alter table public.messages            enable row level security;
alter table public.subscription_events enable row level security;
alter table public.till_devices        enable row level security;

-- businesses --------------------------------------------------------------
create policy biz_select on public.businesses
  for select using (public.is_member(id));
create policy biz_insert on public.businesses
  for insert with check (auth.uid() is not null);
create policy biz_update on public.businesses
  for update using (public.is_member(id)) with check (public.is_member(id));

-- membership ---------------------------------------------------------------
create policy mem_select on public.business_members
  for select using (user_id = auth.uid() or public.is_member(business_id));
create policy mem_insert on public.business_members
  for insert with check (user_id = auth.uid() or public.is_owner(business_id));
create policy mem_delete on public.business_members
  for delete using (public.is_owner(business_id));

-- tenant-scoped tables -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'staff','programs','tiers','customers','rewards','transactions',
    'campaigns','messages','till_devices'
  ] loop
    execute format($f$
      create policy %1$s_all on public.%1$s
        for all using (public.is_member(business_id))
        with check (public.is_member(business_id));
    $f$, t);
  end loop;
end $$;

-- billing events are written by the webhook (service role) and read by owners
create policy sub_select on public.subscription_events
  for select using (public.is_member(business_id));

-- public.staff_secrets and public.business_whatsapp deliberately get NO policy. RLS is on, so every browser
-- client sees zero rows; only the service role (which bypasses RLS) can read a
-- PIN hash or a WhatsApp access token, and it only does so inside
-- verify_staff_pin() and the outbox worker respectively.
--
-- Note on customers.card_token: business members CAN read it, and that is
-- intended — "Open their card" in the dashboard is exactly that link. It is
-- kept out of API responses (award/redeem strip it) so it never leaks to a
-- till device or a browser that has no business holding it.
