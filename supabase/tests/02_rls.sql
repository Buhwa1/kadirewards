\set ON_ERROR_STOP on
\pset pager off

-- Two shops, two owners. Neither may see the other's customers.
do $$
declare u1 uuid; u2 uuid; b1 uuid; b2 uuid;
begin
  delete from public.businesses where slug in ('shop-a','shop-b');
  delete from auth.users where email in ('a@test.io','b@test.io');

  insert into auth.users (email) values ('a@test.io') returning id into u1;
  insert into auth.users (email) values ('b@test.io') returning id into u2;
  insert into public.businesses (slug, name) values ('shop-a','Shop A') returning id into b1;
  insert into public.businesses (slug, name) values ('shop-b','Shop B') returning id into b2;
  insert into public.business_members (business_id, user_id, role) values (b1, u1, 'owner'), (b2, u2, 'owner');
  insert into public.programs (business_id) values (b1), (b2);

  perform public.resolve_customer(b1, '0771000001', true, 'A Customer');
  perform public.resolve_customer(b2, '0771000002', true, 'B Customer');
end $$;

\set ON_ERROR_STOP on
select id as uid_a from auth.users where email='a@test.io' \gset
select id as uid_b from auth.users where email='b@test.io' \gset

-- act as owner A
select set_config('request.jwt.claim.sub', :'uid_a', false);
set role authenticated;

do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.customers;
  assert n = 1, format('owner A must see exactly their 1 customer, saw %s', n);

  select count(*) into n from public.businesses;
  assert n = 1, format('owner A must see exactly their 1 business, saw %s', n);

  -- the privileged RPCs are not reachable with a user token
  ok := false;
  begin
    perform public.award(
      (select id from public.businesses limit 1), '0771000001', 1000);
  exception when insufficient_privilege then ok := true;
       when others then ok := sqlerrm like '%permission denied%';
  end;
  assert ok, 'award() must not be executable by an authenticated user token';

  ok := false;
  begin
    perform public.set_staff_pin(gen_random_uuid(), '0000');
  exception when insufficient_privilege then ok := true;
       when others then ok := sqlerrm like '%permission denied%';
  end;
  assert ok, 'set_staff_pin() must not be executable by an authenticated user token';

  raise notice 'PASS  tenant isolation and RPC lockdown (owner A)';
end $$;

-- act as owner B
reset role;
select set_config('request.jwt.claim.sub', :'uid_b', false);
set role authenticated;
do $$
declare n int; nm text;
begin
  select count(*) into n from public.customers;
  assert n = 1, format('owner B must see exactly their 1 customer, saw %s', n);
  select name into nm from public.customers limit 1;
  assert nm = 'B Customer', format('owner B saw the wrong customer: %s', nm);
  raise notice 'PASS  tenant isolation (owner B)';
end $$;

-- anonymous visitor
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.customers;
  assert n = 0, format('anon must see no customers, saw %s', n);
  select count(*) into n from public.businesses;
  assert n = 0, format('anon must see no businesses, saw %s', n);
  raise notice 'PASS  anonymous role sees nothing';
end $$;

reset role;
\echo ALL RLS TESTS PASSED
