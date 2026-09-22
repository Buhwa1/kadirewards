-- ============================================================================
-- Demo data for local development.
-- Gives you a working till immediately:  shop code  kikoni-coffee   PIN  1234
-- The dashboard needs a real auth user, so sign up in the app and then run the
-- one-line INSERT at the bottom to attach yourself to this business.
-- ============================================================================
do $$
declare
  biz uuid;
  prog uuid;
  cust uuid;
  i int;
  amt numeric;
  when_ timestamptz;
begin
  insert into public.businesses (slug, name, category, phone, brand_color)
  values ('kikoni-coffee', 'Kikoni Coffee House', 'restaurant', '+256772000111', '#7C3AED')
  returning id into biz;

  insert into public.programs (
    business_id, type, points_per_currency, welcome_bonus, birthday_bonus,
    referral_bonus_referrer, referral_bonus_referee, award_cooldown_minutes
  )
  values (biz, 'points', 0.001, 20, 50, 50, 20, 0)
  returning id into prog;

  insert into public.tiers (business_id, name, min_points_lifetime, multiplier, color, sort) values
    (biz, 'Bronze', 0,    1.00, '#B45309', 0),
    (biz, 'Silver', 500,  1.25, '#64748B', 1),
    (biz, 'Gold',   2000, 1.50, '#CA8A04', 2);

  insert into public.rewards (business_id, title, description, cost_points, cash_value, sort) values
    (biz, 'Free coffee',        'Any size, dine-in',        100, 5000,  0),
    (biz, '10% off your bill',  'One bill, one use',        250, null,  1),
    (biz, 'Free breakfast',     'Weekdays before 11am',     500, 18000, 2);

  insert into public.staff (business_id, name) values (biz, 'Sarah'), (biz, 'Denis');
  perform public.set_staff_pin(id, case when name = 'Sarah' then '1234' else '5678' end)
    from public.staff where business_id = biz;

  insert into public.campaigns (business_id, name, kind, multiplier, days_of_week, hour_start, hour_end)
  values (biz, 'Quiet Tuesday', 'multiplier', 2.0, array[2], 14, 17);

  -- twelve customers with a few weeks of history
  for i in 1..12 loop
    insert into public.customers (business_id, phone, name, card_code, card_token, referral_code)
    values (
      biz,
      '+25677200' || lpad(i::text, 4, '0'),
      (array['Aisha','Brian','Cynthia','Daniel','Esther','Fred','Grace','Henry',
             'Irene','Joseph','Kevin','Lydia'])[i],
      public.gen_card_code(6),
      encode(gen_random_bytes(18), 'hex'),
      public.gen_card_code(6)
    )
    returning id into cust;

    for _ in 1..(1 + floor(random() * 8)::int) loop
      amt   := 5000 + floor(random() * 45000);
      -- the last three drifted away months ago, so the free win-back list on
      -- the campaigns page has something in it out of the box
      if i > 9 then
        when_ := now() - make_interval(days => 70 + floor(random() * 60)::int);
      else
        when_ := now() - make_interval(days => floor(random() * 28)::int,
                                       hours => floor(random() * 12)::int);
      end if;
      insert into public.transactions (business_id, customer_id, kind, points_delta,
                                       amount, channel, occurred_at, created_at)
      values (biz, cust, 'award', floor(amt * 0.001)::int, amt, 'till', when_, when_);
    end loop;

    update public.customers c set
      points_balance  = t.pts,
      points_lifetime = t.pts,
      visits          = t.n,
      total_spend     = t.spend,
      first_visit_at  = t.first,
      last_visit_at   = t.last,
      tier_id         = public.tier_for(biz, t.pts)
    from (
      select sum(points_delta)::int pts, count(*)::int n, sum(amount) spend,
             min(occurred_at) first, max(occurred_at) last
      from public.transactions where customer_id = cust
    ) t
    where c.id = cust;
  end loop;

  raise notice 'Demo shop ready. Till: shop code "kikoni-coffee", PIN 1234 (Sarah) or 5678 (Denis).';
end $$;

-- After signing up in the app, attach yourself as the owner:
--
--   insert into public.business_members (business_id, user_id, role)
--   select b.id, u.id, 'owner'
--   from public.businesses b, auth.users u
--   where b.slug = 'kikoni-coffee' and u.email = 'you@example.com';
