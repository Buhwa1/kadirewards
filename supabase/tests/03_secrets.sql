\set ON_ERROR_STOP on
select id as uid_a from auth.users where email='a@test.io' \gset
select set_config('request.jwt.claim.sub', :'uid_a', false);
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.staff_secrets;
  assert n = 0, format('an authenticated client must see zero PIN hashes, saw %s', n);

  select count(*) into n from public.business_whatsapp;
  assert n = 0, format('an authenticated client must see zero WhatsApp tokens, saw %s', n);
  raise notice 'PASS  PIN hashes and WhatsApp tokens invisible to every browser client';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.staff_secrets;
  assert n >= 2, 'the service role (bypassing RLS) still sees them';

  -- Option B: a shop connects its own WhatsApp account. The outbox worker
  -- (service role) must be able to read that row; nobody else may.
  insert into public.business_whatsapp (business_id, phone_number_id, access_token)
  select id, '123456', 'secret-token' from public.businesses where slug = 'kikoni-coffee'
  on conflict (business_id) do nothing;
  select count(*) into n from public.business_whatsapp;
  assert n >= 1, 'the outbox worker must be able to read a shop''s own credentials';
  raise notice 'PASS  service role can still verify a PIN and read sender credentials';
end $$;
