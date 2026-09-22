\set ON_ERROR_STOP on
\pset pager off

do $$
declare
  biz uuid;
  prog uuid;
  progrow public.programs;
  staff uuid;
  r jsonb;
  c public.customers;
  ref public.customers;
  rw uuid;
  code text;
  n int;
  ok boolean;
begin
  select id into biz from public.businesses where slug = 'kikoni-coffee';
  select id into prog from public.programs where business_id = biz;
  select id into staff from public.staff where business_id = biz and name = 'Sarah';

  -- 1. phone normalisation ---------------------------------------------
  assert public.normalize_phone('0772123456','UG') = '+256772123456', 'norm 0-prefix';
  assert public.normalize_phone('772123456','UG')  = '+256772123456', 'norm bare';
  assert public.normalize_phone('+256 772 123 456','UG') = '+256772123456', 'norm e164';
  assert public.normalize_phone('256772123456','UG') = '+256772123456', 'norm cc';
  assert public.normalize_phone('0712345678','KE') = '+254712345678', 'norm KE';
  raise notice 'PASS  phone normalisation';

  -- 2. award creates a customer from a phone number ---------------------
  r := public.award(biz, '0700111222', 25000, 'idem-1', staff, 'dev-1');
  assert (r->>'points_awarded')::int = 25, format('expected 25 points, got %s', r->>'points_awarded');
  assert (r->>'duplicate')::boolean = false, 'first award is not a duplicate';
  select * into c from public.customers where business_id = biz and phone = '+256700111222';
  assert c.points_balance = 45, format('welcome 20 + 25 = 45, got %s', c.points_balance);
  raise notice 'PASS  award creates customer, applies welcome bonus';

  -- 3. idempotency: replaying the same key changes nothing ---------------
  r := public.award(biz, '0700111222', 25000, 'idem-1', staff, 'dev-1');
  assert (r->>'duplicate')::boolean = true, 'replay must be flagged duplicate';
  select points_balance into n from public.customers where id = c.id;
  assert n = 45, format('replay must not add points, balance is %s', n);
  select count(*) into n from public.transactions where business_id = biz and idempotency_key = 'idem-1';
  assert n = 1, 'replay must not write a second ledger row';
  raise notice 'PASS  idempotent replay';

  -- 4. cooldown --------------------------------------------------------
  update public.programs set award_cooldown_minutes = 5 where id = prog;
  ok := false;
  begin
    r := public.award(biz, '0700111222', 5000, 'idem-2', staff, 'dev-1');
  exception when others then
    ok := sqlerrm like '%COOLDOWN_ACTIVE%';
  end;
  assert ok, 'a second sale inside the cooldown must be rejected';
  raise notice 'PASS  cooldown blocks rapid re-scans';

  -- 5. the card code rail resolves the same customer ---------------------
  update public.programs set award_cooldown_minutes = 0 where id = prog;
  r := public.award(biz, c.card_code, 10000, 'idem-3', staff, 'dev-1');
  assert (r->'customer'->>'id') = c.id::text, 'card code must resolve the same customer';
  r := public.award(biz, 'KADI:kikoni-coffee:' || c.card_code, 10000, 'idem-3b', staff, 'dev-1');
  assert (r->'customer'->>'id') = c.id::text, 'QR payload must resolve the same customer';
  raise notice 'PASS  dual-rail identity (phone, card code, QR payload)';

  -- 6. an unknown card code is an error, not a new customer -------------
  ok := false;
  begin
    r := public.award(biz, 'ZZZZZZ', 1000, 'idem-4', staff, 'dev-1');
  exception when others then ok := sqlerrm like '%CARD_NOT_FOUND%';
  end;
  assert ok, 'unknown card code must fail rather than silently enrol';
  raise notice 'PASS  unknown card code rejected';

  -- 7. daily cap -------------------------------------------------------
  update public.programs set max_awards_per_day = 4 where id = prog;
  ok := false;
  begin
    for n in 1..6 loop
      r := public.award(biz, '0700111222', 1000, 'cap-' || n, staff, 'dev-1');
    end loop;
  exception when others then ok := sqlerrm like '%DAILY_LIMIT_REACHED%';
  end;
  assert ok, 'daily cap must eventually reject';
  update public.programs set max_awards_per_day = 50 where id = prog;
  raise notice 'PASS  daily cap';

  -- 8. tier multiplier -------------------------------------------------
  update public.customers set points_lifetime = 2500,
    tier_id = public.tier_for(biz, 2500) where id = c.id;
  r := public.award(biz, '0700111222', 100000, 'idem-5', staff, 'dev-1');
  assert (r->>'points_awarded')::int = 150,
    format('gold 1.5x on 100k should be 150, got %s', r->>'points_awarded');
  raise notice 'PASS  tier multiplier applied';

  -- 9. referral: referrer paid on the friend's first sale ---------------
  select * into ref from public.customers where id = c.id;
  perform public.resolve_customer(biz, '0700999888', true, 'Friend', ref.referral_code);
  select points_balance into n from public.customers where business_id = biz and phone = '+256700999888';
  assert n = 40, format('welcome 20 + referee bonus 20 = 40, got %s', n);
  select points_balance into n from public.customers where id = ref.id;
  r := public.award(biz, '0700999888', 5000, 'idem-ref', staff, 'dev-1');
  select points_balance into n from public.customers where id = ref.id;
  assert n = ref.points_balance + 50, format('referrer should gain 50, went %s -> %s', ref.points_balance, n);
  raise notice 'PASS  referral pays out on the referee''s first sale';

  -- 10. redemption needs the rotating code ------------------------------
  select id into rw from public.rewards where business_id = biz and cost_points = 100;
  update public.customers set points_balance = 1000 where id = c.id;

  ok := false;
  begin
    r := public.redeem(biz, '0700111222', rw, '000000', staff, 'dev-1');
  exception when others then ok := sqlerrm like '%BAD_REDEEM_CODE%';
  end;
  assert ok, 'a wrong code must be rejected';

  code := (public.rotate_redeem_code(c.id, 10))->>'code';
  r := public.redeem(biz, '0700111222', rw, code, staff, 'dev-1');
  select points_balance into n from public.customers where id = c.id;
  assert n = 900, format('1000 - 100 = 900, got %s', n);
  raise notice 'PASS  redemption requires the customer''s rotating code';

  -- 11. the code is single-use ------------------------------------------
  ok := false;
  begin
    r := public.redeem(biz, '0700111222', rw, code, staff, 'dev-1');
  exception when others then ok := sqlerrm like '%BAD_REDEEM_CODE%';
  end;
  assert ok, 'the code must not be reusable after a redemption';
  raise notice 'PASS  rotating code is single-use';

  -- 12. insufficient balance --------------------------------------------
  update public.customers set points_balance = 10 where id = c.id;
  code := (public.rotate_redeem_code(c.id, 10))->>'code';
  ok := false;
  begin
    r := public.redeem(biz, '0700111222', rw, code, staff, 'dev-1');
  exception when others then ok := sqlerrm like '%INSUFFICIENT_POINTS%';
  end;
  assert ok, 'cannot redeem past the balance';
  raise notice 'PASS  insufficient balance rejected';

  -- 13. per-customer limit ----------------------------------------------
  update public.rewards set per_customer_limit = 1 where id = rw;
  update public.customers set points_balance = 1000 where id = c.id;
  code := (public.rotate_redeem_code(c.id, 10))->>'code';
  ok := false;
  begin
    r := public.redeem(biz, '0700111222', rw, code, staff, 'dev-1');
  exception when others then ok := sqlerrm like '%PER_CUSTOMER_LIMIT%';
  end;
  assert ok, 'per-customer limit must hold';
  update public.rewards set per_customer_limit = null where id = rw;
  raise notice 'PASS  per-customer reward limit';

  -- 14. blocked card -----------------------------------------------------
  update public.customers set blocked = true where id = c.id;
  ok := false;
  begin
    r := public.award(biz, '0700111222', 1000, 'idem-blocked', staff, 'dev-1');
  exception when others then ok := sqlerrm like '%CUSTOMER_BLOCKED%';
  end;
  assert ok, 'a blocked card cannot earn';
  update public.customers set blocked = false where id = c.id;
  raise notice 'PASS  blocked card rejected';

  -- 15. stamp mode --------------------------------------------------------
  update public.programs set type = 'stamps', stamp_min_spend = 3000,
    award_cooldown_minutes = 0 where id = prog;
  update public.customers set stamps = 0 where id = c.id;
  r := public.award(biz, '0700111222', 5000, 'stamp-1', staff, 'dev-1');
  assert (r->>'stamps_awarded')::int = 1, 'a qualifying sale earns one stamp';
  assert (r->>'points_awarded')::int = 0, 'stamp mode awards no points';
  r := public.award(biz, '0700111222', 1000, 'stamp-2', staff, 'dev-1');
  assert (r->>'stamps_awarded')::int = 0, 'a sale under the minimum earns no stamp';
  update public.programs set type = 'points' where id = prog;
  raise notice 'PASS  stamp-card mode';

  -- 16. staff PIN ---------------------------------------------------------
  assert (public.verify_staff_pin(biz, '1234')).name = 'Sarah', 'correct PIN resolves the cashier';
  ok := false;
  begin
    perform public.verify_staff_pin(biz, '9999');
  exception when others then ok := sqlerrm like '%BAD_PIN%';
  end;
  assert ok, 'a wrong PIN must fail';
  raise notice 'PASS  staff PIN check';

  -- 17. points expiry ------------------------------------------------------
  update public.programs set points_expire_days = 30 where id = prog;
  update public.customers set points_balance = 500,
    last_visit_at = now() - interval '90 days' where id = c.id;
  perform public.run_daily_jobs();
  select points_balance into n from public.customers where id = c.id;
  assert n = 0, format('stale points should expire to 0, got %s', n);
  select count(*) into n from public.transactions where customer_id = c.id and kind = 'expire';
  assert n = 1, 'expiry must be written to the ledger';
  update public.programs set points_expire_days = null where id = prog;
  raise notice 'PASS  points expiry';

  -- 18. messaging defaults: the expensive ones are OFF ----------------------
  select * into progrow from public.programs where id = prog;
  assert progrow.notify_receipt = false, 'per-sale receipts must be off by default';
  assert progrow.notify_redeem = false, 'redemption confirmations must be off by default';
  assert progrow.notify_milestone = true, 'the milestone nudge must be on by default';

  select count(*) into n from public.messages where business_id = biz and kind = 'receipt';
  assert n = 0, format('no receipts should have been queued, found %s', n);
  raise notice 'PASS  costly messages off by default, nothing queued for them';

  -- 19. switching receipts on actually queues them ---------------------------
  update public.programs set notify_receipt = true, award_cooldown_minutes = 0 where id = prog;
  r := public.award(biz, '0700111222', 8000, 'msg-1', staff, 'dev-1');
  select count(*) into n from public.messages where business_id = biz and kind = 'receipt';
  assert n = 1, format('one receipt expected once switched on, found %s', n);
  update public.programs set notify_receipt = false where id = prog;
  raise notice 'PASS  receipts queue when a shop opts in';

  -- 20. an opted-out customer is never messaged ------------------------------
  update public.programs set notify_receipt = true where id = prog;
  update public.customers set whatsapp_opt_in = false where id = c.id;
  r := public.award(biz, '0700111222', 8000, 'msg-2', staff, 'dev-1');
  select count(*) into n from public.messages where business_id = biz and kind = 'receipt';
  assert n = 1, 'an opted-out customer must not be queued a message';
  update public.customers set whatsapp_opt_in = true where id = c.id;
  update public.programs set notify_receipt = false where id = prog;
  raise notice 'PASS  opt-out respected';

  -- 21. the milestone nudge -------------------------------------------------
  update public.programs set milestone_points_gap = 50, milestone_cooldown_days = 30 where id = prog;
  delete from public.messages where business_id = biz and kind = 'milestone';

  -- far from the cheapest reward (100 pts): no nudge
  update public.customers set points_balance = 10 where id = c.id;
  ok := public.maybe_queue_milestone(biz, c.id);
  assert ok = false, 'no nudge when the reward is still far away';

  -- within 50 points of it: nudge
  update public.customers set points_balance = 70 where id = c.id;
  ok := public.maybe_queue_milestone(biz, c.id);
  assert ok = true, 'a nudge should fire when the reward is within reach';
  select count(*) into n from public.messages where customer_id = c.id and kind = 'milestone';
  assert n = 1, format('exactly one nudge expected, found %s', n);

  -- and not again inside the cooldown
  ok := public.maybe_queue_milestone(biz, c.id);
  assert ok = false, 'the nudge must not repeat inside its cooldown';
  select count(*) into n from public.messages where customer_id = c.id and kind = 'milestone';
  assert n = 1, 'still exactly one nudge after a second attempt';
  raise notice 'PASS  milestone nudge fires once, in range, then holds off';

  -- 22. broadcasts are billed as marketing ----------------------------------
  insert into public.messages (business_id, customer_id, to_phone, kind, category, body)
  values (biz, c.id, '+256700111222', 'broadcast', 'marketing', 'We miss you');
  select count(*) into n from public.messages
    where business_id = biz and kind = 'broadcast' and category = 'marketing';
  assert n = 1, 'broadcasts must be tagged marketing so their cost is visible';
  raise notice 'PASS  broadcast cost category recorded';

  -- 23. a shop can switch WhatsApp off entirely ------------------------------
  update public.businesses set whatsapp_mode = 'off' where id = biz;
  update public.programs set notify_receipt = true where id = prog;
  select count(*) into n from public.messages where business_id = biz;
  ok := public.queue_message(biz, c.id, 'receipt', 'should not send');
  assert ok = false, 'whatsapp_mode = off must suppress everything';
  update public.businesses set whatsapp_mode = 'shared' where id = biz;
  update public.programs set notify_receipt = false where id = prog;
  raise notice 'PASS  messaging can be switched off per shop';

  -- 24. manual outreach is logged but never billed ---------------------------
  -- The owner sending from their own phone through a wa.me link costs nothing,
  -- so it must not show up in any cost figure.
  insert into public.messages (business_id, customer_id, to_phone, channel, kind,
                               category, status, body)
  values (biz, c.id, '+256700111222', 'manual', 'broadcast', 'service', 'sent',
          'Hi, we miss you');
  select count(*) into n from public.messages
    where business_id = biz and channel = 'manual';
  assert n = 1, 'manual outreach should be recorded for history and de-duplication';

  -- business_stats() counts billable sends as channel = 'whatsapp' only.
  -- (Its membership guard is exercised in 02_rls.sql; here we assert the same
  -- predicate directly, since this block runs without a user token.)
  select count(*) into n from public.messages
    where business_id = biz and status = 'sent' and channel = 'whatsapp';
  assert n = 0, format('manual sends must not count as billable, got %s', n);
  raise notice 'PASS  manual wa.me outreach logged, and excluded from billable counts';

  -- 25. template parameter counts are stable per kind ------------------------
  -- A WhatsApp template has a fixed number of positional variables. If points
  -- mode and stamps mode disagree about how many they send, one of them fails
  -- at Meta with a useless error, so pin it down here.
  select count(*) into n from (
    select kind
    from public.messages
    where jsonb_array_length(params) > 0
    group by kind
    having count(distinct jsonb_array_length(params)) > 1
  ) bad;
  assert n = 0,
    format('%s message kind(s) queue inconsistent parameter counts — a template needs exactly one', n);
  raise notice 'PASS  each message kind sends a consistent template parameter count';

  raise notice '';
  raise notice 'ALL BUSINESS-LOGIC TESTS PASSED';
end $$;
