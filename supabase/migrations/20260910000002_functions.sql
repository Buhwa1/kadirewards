-- ============================================================================
-- Kadi — 0002: business logic
-- All earning/redeeming lives in the database. The till and the dashboard are
-- both thin clients, so an offline till replaying a queue and a manager making
-- a manual adjustment go through exactly the same rules.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pgcrypto lives in the `extensions` schema on hosted Supabase (and on the
-- CLI's local image). Every security-definer function below that touches
-- crypt/gen_salt/gen_random_bytes therefore pins
--   set search_path = public, extensions
-- rather than `public` alone. Keeping it as a search_path entry (instead of
-- hardcoding `extensions.crypt(...)`) means the same migration still works if
-- pgcrypto happens to be installed into `public` somewhere.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Membership helpers. Defined here because the security-definer functions
-- below use them to guard themselves.
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p_business uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(p_business uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Phone normalisation. Handles the way people actually type numbers in
-- Uganda/Kenya/Tanzania/Rwanda: 0772…, 772…, 256772…, +256 772 123 456.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p_raw text, p_country text default 'UG')
returns text
language plpgsql
immutable
as $$
declare
  d  text;
  cc text;
begin
  if p_raw is null or btrim(p_raw) = '' then return null; end if;

  d := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  cc := case upper(coalesce(p_country,'UG'))
          when 'UG' then '256' when 'KE' then '254'
          when 'TZ' then '255' when 'RW' then '250'
          when 'ZM' then '260' when 'GH' then '233'
          when 'NG' then '234' else '256' end;

  if left(d,1) = '+' then
    return d;
  elsif left(d, length(cc)) = cc and length(d) >= length(cc) + 8 then
    return '+' || d;
  elsif left(d,1) = '0' then
    return '+' || cc || substring(d from 2);
  elsif length(d) between 8 and 10 then
    return '+' || cc || d;
  end if;
  return '+' || d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Short, human-readable card code. Crockford-ish alphabet: no 0/O, 1/I, U.
-- A cashier can read it off a printed card over a bad phone line.
-- ---------------------------------------------------------------------------
create or replace function public.gen_card_code(p_len int default 6)
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTVWXYZ';
  v_out    text := '';
  i        int;
begin
  for i in 1..p_len loop
    v_out := v_out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tier for a lifetime-points total
-- ---------------------------------------------------------------------------
create or replace function public.tier_for(p_business uuid, p_lifetime int)
returns uuid
language sql
stable
as $$
  select id from public.tiers
  where business_id = p_business and min_points_lifetime <= p_lifetime
  order by min_points_lifetime desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Active earn multiplier: tier multiplier x any live happy-hour campaign.
-- Campaign windows are evaluated in the business's own timezone.
-- ---------------------------------------------------------------------------
create or replace function public.active_multiplier(p_business uuid, p_customer uuid, p_at timestamptz)
returns numeric
language plpgsql
stable
as $$
declare
  tz     text;
  loc_ts timestamp;
  m      numeric := 1.0;
  camp   numeric;
begin
  select timezone into tz from public.businesses where id = p_business;
  loc_ts := p_at at time zone coalesce(tz, 'Africa/Kampala');

  select coalesce(t.multiplier, 1.0) into m
  from public.customers c left join public.tiers t on t.id = c.tier_id
  where c.id = p_customer;
  m := coalesce(m, 1.0);

  select max(c.multiplier) into camp
  from public.campaigns c
  where c.business_id = p_business
    and c.active
    and c.kind = 'multiplier'
    and (c.starts_at is null or p_at >= c.starts_at)
    and (c.ends_at   is null or p_at <  c.ends_at)
    and (c.days_of_week is null or extract(dow from loc_ts)::int = any(c.days_of_week))
    and (c.hour_start is null or extract(hour from loc_ts)::int >= c.hour_start)
    and (c.hour_end   is null or extract(hour from loc_ts)::int <  c.hour_end);

  return m * coalesce(camp, 1.0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Queue an outbound WhatsApp message (drained by /api/messages/drain)
-- ---------------------------------------------------------------------------
create or replace function public.queue_message(
  p_business uuid,
  p_customer uuid,
  p_kind     text,
  p_body     text,
  p_params   jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  ph   text;
  opt  boolean;
  blk  boolean;
  prog public.programs;
  mode text;
  send boolean;
  cat  text;
begin
  select phone, whatsapp_opt_in, blocked into ph, opt, blk
    from public.customers where id = p_customer;
  if ph is null or opt is not true or blk is true then return false; end if;

  select whatsapp_mode into mode from public.businesses where id = p_business;
  if mode = 'off' then return false; end if;

  select * into prog from public.programs where business_id = p_business and active;
  if prog.id is null then return false; end if;

  -- Every one of these costs money to send, so each has its own switch and the
  -- expensive-but-useless ones are off by default.
  send := case p_kind
            when 'receipt'   then prog.notify_receipt
            when 'redeem'    then prog.notify_redeem
            when 'milestone' then prog.notify_milestone
            when 'birthday'  then prog.notify_birthday
            when 'referral'  then prog.notify_referral
            when 'broadcast' then true
            else false
          end;
  if send is not true then return false; end if;

  cat := case when p_kind = 'broadcast' then 'marketing' else 'utility' end;

  insert into public.messages (business_id, customer_id, to_phone, kind, category, body, params)
  values (p_business, p_customer, ph, p_kind, cat, p_body, coalesce(p_params, '[]'::jsonb));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- The milestone nudge: the one automatic message worth paying for.
-- Fires when a customer comes within reach of the cheapest reward they cannot
-- yet afford, at most once every milestone_cooldown_days.
-- ---------------------------------------------------------------------------
create or replace function public.maybe_queue_milestone(p_business uuid, p_customer uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  prog   public.programs;
  biz    public.businesses;
  cust   public.customers;
  rw     public.rewards;
  have   int;
  gap    int;
  recent timestamptz;
begin
  select * into prog from public.programs where business_id = p_business and active;
  if prog.id is null or prog.notify_milestone is not true then return false; end if;

  select * into biz  from public.businesses where id = p_business;
  select * into cust from public.customers  where id = p_customer;

  -- don't nag
  select max(created_at) into recent from public.messages
    where customer_id = p_customer and kind = 'milestone';
  if recent is not null
     and recent > now() - make_interval(days => prog.milestone_cooldown_days) then
    return false;
  end if;

  if prog.type = 'stamps' then
    have := cust.stamps % greatest(prog.stamps_required, 1);
    gap  := prog.stamps_required - have;
    if gap <= 0 or gap > prog.milestone_stamps_gap then return false; end if;
    -- Template variables are positional and fixed in number, so points mode and
    -- stamps mode must produce the SAME three: shop, what's missing, what they get.
    return public.queue_message(p_business, p_customer, 'milestone',
      format('%s: just %s %s away from a free one.',
             biz.name, gap, case when gap = 1 then 'stamp' else 'stamps' end),
      jsonb_build_array(
        biz.name,
        format('%s %s', gap, case when gap = 1 then 'stamp' else 'stamps' end),
        'a free one'));
  end if;

  -- points: the cheapest reward they can't afford yet
  select * into rw from public.rewards
    where business_id = p_business and active and cost_points > cust.points_balance
      and (expires_at is null or expires_at > now())
      and (stock is null or stock > 0)
    order by cost_points
    limit 1;
  if rw.id is null then return false; end if;

  gap := rw.cost_points - cust.points_balance;
  if gap > prog.milestone_points_gap then return false; end if;

  return public.queue_message(p_business, p_customer, 'milestone',
    format('%s: you are %s points away from "%s".', biz.name, gap, rw.title),
    jsonb_build_array(biz.name, format('%s points', gap), rw.title));
end;
$$;

-- ---------------------------------------------------------------------------
-- Find or create a customer from either rail (phone or card code).
-- p_identifier accepts:  +256772123456 | 0772123456 | 4F7QX2 | KADI:slug:4F7QX2
-- Needs `extensions` on the search_path for gen_random_bytes (pgcrypto).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_customer(
  p_business    uuid,
  p_identifier  text,
  p_create      boolean default true,
  p_name        text default null,
  p_referral    text default null
) returns public.customers
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  ident   text := btrim(coalesce(p_identifier, ''));
  ctry    text;
  cust    public.customers;
  v_phone text;
  v_code  text;
  prog    public.programs;
  ref     public.customers;
  tries   int := 0;
begin
  if ident = '' then raise exception 'IDENTIFIER_REQUIRED'; end if;
  select country into ctry from public.businesses where id = p_business;
  if ctry is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  -- QR payload form
  if ident like 'KADI:%' then
    ident := split_part(ident, ':', 3);
  end if;

  if ident ~ '^[0-9+][0-9 +()\-]*$' then
    v_phone := public.normalize_phone(ident, ctry);
    if v_phone is null then raise exception 'IDENTIFIER_REQUIRED'; end if;
    select * into cust from public.customers c
      where c.business_id = p_business and c.phone = v_phone;
  else
    v_code := upper(regexp_replace(ident, '[^A-Za-z0-9]', '', 'g'));
    select * into cust from public.customers c
      where c.business_id = p_business and c.card_code = v_code;
    if cust.id is null then raise exception 'CARD_NOT_FOUND'; end if;
  end if;

  if cust.id is not null then
    return cust;
  end if;
  if not p_create then raise exception 'CUSTOMER_NOT_FOUND'; end if;

  -- create (phone rail only — a blank card must be issued from the dashboard)
  loop
    tries := tries + 1;
    begin
      insert into public.customers (business_id, phone, name, card_code, card_token, referral_code)
      values (
        p_business, v_phone, nullif(btrim(coalesce(p_name,'')),''),
        public.gen_card_code(6),
        encode(gen_random_bytes(18), 'hex'),
        public.gen_card_code(6)
      )
      returning * into cust;
      exit;
    exception when unique_violation then
      if tries > 5 then raise; end if;
    end;
  end loop;

  select * into prog from public.programs where business_id = p_business and active;

  -- welcome bonus
  if prog.id is not null and prog.welcome_bonus > 0 then
    insert into public.transactions (business_id, customer_id, kind, points_delta, channel, note)
    values (p_business, cust.id, 'bonus', prog.welcome_bonus, 'system', 'Welcome bonus');
    update public.customers
      set points_balance = points_balance + prog.welcome_bonus,
          points_lifetime = points_lifetime + prog.welcome_bonus
      where id = cust.id returning * into cust;
  end if;

  -- referral: credit the referee now, the referrer on their friend's first sale
  if p_referral is not null and btrim(p_referral) <> '' then
    select * into ref from public.customers
      where business_id = p_business and referral_code = upper(btrim(p_referral));
    if found and ref.id <> cust.id then
      update public.customers set referred_by = ref.id where id = cust.id returning * into cust;
      if coalesce(prog.referral_bonus_referee,0) > 0 then
        insert into public.transactions (business_id, customer_id, kind, points_delta, channel, note)
        values (p_business, cust.id, 'bonus', prog.referral_bonus_referee, 'system', 'Referred by a friend');
        update public.customers
          set points_balance = points_balance + prog.referral_bonus_referee,
              points_lifetime = points_lifetime + prog.referral_bonus_referee
          where id = cust.id returning * into cust;
      end if;
    end if;
  end if;

  update public.customers set tier_id = public.tier_for(p_business, cust.points_lifetime)
    where id = cust.id returning * into cust;

  return cust;
end;
$$;

-- ---------------------------------------------------------------------------
-- AWARD — the hot path. Idempotent by (business_id, idempotency_key) so an
-- offline till can replay its whole queue safely after a power cut.
-- ---------------------------------------------------------------------------
create or replace function public.award(
  p_business    uuid,
  p_identifier  text,
  p_amount      numeric,
  p_idem        text        default null,
  p_staff       uuid        default null,
  p_device      text        default null,
  p_occurred_at timestamptz default now(),
  p_channel     text        default 'till',
  p_name        text        default null,
  p_referral    text        default null
) returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  cust    public.customers;
  prog    public.programs;
  biz     public.businesses;
  mult    numeric;
  pts     int := 0;
  stmps   int := 0;
  existing public.transactions;
  recent  timestamptz;
  today_n int;
  ref     public.customers;
  txn     public.transactions;
  new_tier uuid;
  old_tier uuid;
begin
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- replay guard, before any side effect
  if p_idem is not null then
    select * into existing from public.transactions
      where business_id = p_business and idempotency_key = p_idem;
    if found then
      select * into cust from public.customers where id = existing.customer_id;
      return jsonb_build_object(
        'duplicate', true,
        'transaction_id', existing.id,
        'points_awarded', existing.points_delta,
        'stamps_awarded', existing.stamps_delta,
        'customer', to_jsonb(cust) - 'card_token'
      );
    end if;
  end if;

  select * into biz  from public.businesses where id = p_business;
  select * into prog from public.programs   where business_id = p_business and active;
  if prog.id is null then raise exception 'NO_ACTIVE_PROGRAM'; end if;
  if biz.subscription_status = 'canceled' then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
  if prog.max_award_amount is not null and p_amount > prog.max_award_amount then
    raise exception 'AMOUNT_ABOVE_LIMIT';
  end if;

  cust := public.resolve_customer(p_business, p_identifier, true, p_name, p_referral);
  if cust.blocked then raise exception 'CUSTOMER_BLOCKED'; end if;

  -- anti-farming: cooldown between awards for the same card at the same shop
  select max(occurred_at) into recent from public.transactions
    where customer_id = cust.id and kind = 'award';
  if recent is not null
     and p_occurred_at < recent + make_interval(mins => prog.award_cooldown_minutes) then
    raise exception 'COOLDOWN_ACTIVE';
  end if;

  select count(*) into today_n from public.transactions
    where customer_id = cust.id and kind = 'award'
      and occurred_at >= date_trunc('day', p_occurred_at at time zone biz.timezone)
                           at time zone biz.timezone;
  if today_n >= prog.max_awards_per_day then raise exception 'DAILY_LIMIT_REACHED'; end if;

  mult := public.active_multiplier(p_business, cust.id, p_occurred_at);

  if prog.type = 'points' then
    pts := floor(p_amount * prog.points_per_currency * mult)::int;
  else
    if p_amount >= prog.stamp_min_spend then stmps := 1; end if;
  end if;

  insert into public.transactions (
    business_id, customer_id, staff_id, kind, points_delta, stamps_delta,
    amount, multiplier, channel, device_id, idempotency_key, occurred_at
  ) values (
    p_business, cust.id, p_staff, 'award', pts, stmps,
    p_amount, mult, p_channel, p_device, p_idem, p_occurred_at
  ) returning * into txn;

  old_tier := cust.tier_id;
  update public.customers set
    points_balance  = points_balance + pts,
    points_lifetime = points_lifetime + pts,
    stamps          = stamps + stmps,
    visits          = visits + 1,
    total_spend     = total_spend + p_amount,
    first_visit_at  = coalesce(first_visit_at, p_occurred_at),
    last_visit_at   = greatest(coalesce(last_visit_at, p_occurred_at), p_occurred_at)
  where id = cust.id
  returning * into cust;

  new_tier := public.tier_for(p_business, cust.points_lifetime);
  if new_tier is distinct from old_tier then
    update public.customers set tier_id = new_tier where id = cust.id returning * into cust;
  end if;

  -- referrer payout on the referee's first sale
  if cust.referred_by is not null and not cust.referral_credited and prog.referral_bonus_referrer > 0 then
    select * into ref from public.customers where id = cust.referred_by;
    if found then
      insert into public.transactions (business_id, customer_id, kind, points_delta, channel, note)
      values (p_business, ref.id, 'bonus', prog.referral_bonus_referrer, 'system',
              'Referral bonus: ' || coalesce(cust.name, cust.card_code));
      update public.customers
        set points_balance = points_balance + prog.referral_bonus_referrer,
            points_lifetime = points_lifetime + prog.referral_bonus_referrer,
            tier_id = public.tier_for(p_business, points_lifetime + prog.referral_bonus_referrer)
        where id = ref.id;
      update public.customers set referral_credited = true where id = cust.id returning * into cust;
      perform public.queue_message(p_business, ref.id, 'referral',
        format('%s: your friend just shopped with us. %s points added. Balance: %s.',
               biz.name, prog.referral_bonus_referrer, ref.points_balance + prog.referral_bonus_referrer),
        jsonb_build_array(biz.name, prog.referral_bonus_referrer::text,
                          (ref.points_balance + prog.referral_bonus_referrer)::text));
    end if;
  end if;

  -- Off by default: the customer can read all of this on their card link for
  -- free, and a per-sale receipt is the single biggest messaging cost there is.
  perform public.queue_message(p_business, cust.id, 'receipt',
    case when prog.type = 'points' then
      format('%s: +%s points on %s %s. Balance: %s points. Card: %s',
             biz.name, pts, biz.currency, round(p_amount), cust.points_balance, cust.card_code)
    else
      format('%s: stamp %s of %s collected. %s to go!',
             biz.name, cust.stamps % greatest(prog.stamps_required,1), prog.stamps_required,
             greatest(prog.stamps_required - (cust.stamps % greatest(prog.stamps_required,1)), 0))
    end,
    case when prog.type = 'points' then
      jsonb_build_array(biz.name, format('%s points', pts),
                        format('%s points', cust.points_balance))
    else
      jsonb_build_array(biz.name, '1 stamp',
                        format('%s of %s stamps',
                               cust.stamps % greatest(prog.stamps_required,1),
                               prog.stamps_required))
    end);

  -- The message that actually earns its keep.
  perform public.maybe_queue_milestone(p_business, cust.id);

  return jsonb_build_object(
    'duplicate', false,
    'transaction_id', txn.id,
    'points_awarded', pts,
    'stamps_awarded', stmps,
    'multiplier', mult,
    'customer', to_jsonb(cust) - 'card_token'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Rotating redemption code shown on the customer's own card page.
-- ---------------------------------------------------------------------------
create or replace function public.rotate_redeem_code(p_customer uuid, p_ttl_minutes int default 10)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare code text; exp timestamptz;
begin
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  exp  := now() + make_interval(mins => p_ttl_minutes);
  update public.customers
    set redeem_code = code, redeem_code_expires_at = exp
    where id = p_customer;
  return jsonb_build_object('code', code, 'expires_at', exp);
end;
$$;

-- ---------------------------------------------------------------------------
-- REDEEM — online only, on purpose: you cannot safely spend a balance you
-- cannot read. Requires the customer's rotating code unless a manager
-- overrides from the dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.redeem(
  p_business  uuid,
  p_identifier text,
  p_reward    uuid,
  p_code      text default null,
  p_staff     uuid default null,
  p_device    text default null,
  p_override  boolean default false,
  p_idem      text default null
) returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  cust   public.customers;
  rw     public.rewards;
  prog   public.programs;
  biz    public.businesses;
  used   int;
  txn    public.transactions;
  existing public.transactions;
begin
  if p_idem is not null then
    select * into existing from public.transactions
      where business_id = p_business and idempotency_key = p_idem;
    if found then
      select * into cust from public.customers where id = existing.customer_id;
      return jsonb_build_object('duplicate', true, 'transaction_id', existing.id,
                                'customer', to_jsonb(cust) - 'card_token');
    end if;
  end if;

  select * into biz  from public.businesses where id = p_business;
  select * into prog from public.programs where business_id = p_business and active;
  cust := public.resolve_customer(p_business, p_identifier, false);
  if cust.blocked then raise exception 'CUSTOMER_BLOCKED'; end if;

  select * into rw from public.rewards where id = p_reward and business_id = p_business;
  if not found or not rw.active then raise exception 'REWARD_UNAVAILABLE'; end if;
  if rw.expires_at is not null and now() > rw.expires_at then raise exception 'REWARD_EXPIRED'; end if;
  if rw.stock is not null and rw.stock <= 0 then raise exception 'REWARD_OUT_OF_STOCK'; end if;

  if not p_override then
    if cust.redeem_code is null
       or cust.redeem_code_expires_at is null
       or now() > cust.redeem_code_expires_at
       or p_code is null
       or btrim(p_code) <> cust.redeem_code then
      raise exception 'BAD_REDEEM_CODE';
    end if;
  end if;

  if rw.per_customer_limit is not null then
    select count(*) into used from public.transactions
      where customer_id = cust.id and reward_id = rw.id and kind = 'redeem';
    if used >= rw.per_customer_limit then raise exception 'PER_CUSTOMER_LIMIT'; end if;
  end if;

  if rw.cost_points > 0 and cust.points_balance < rw.cost_points then
    raise exception 'INSUFFICIENT_POINTS';
  end if;
  if rw.cost_stamps > 0 and cust.stamps < rw.cost_stamps then
    raise exception 'INSUFFICIENT_STAMPS';
  end if;

  insert into public.transactions (
    business_id, customer_id, staff_id, kind, points_delta, stamps_delta,
    reward_id, channel, device_id, idempotency_key, note
  ) values (
    p_business, cust.id, p_staff, 'redeem', -rw.cost_points, -rw.cost_stamps,
    rw.id, 'till', p_device, p_idem, rw.title
  ) returning * into txn;

  update public.customers set
    points_balance = points_balance - rw.cost_points,
    stamps         = stamps - rw.cost_stamps,
    redeem_code    = null,
    redeem_code_expires_at = null
  where id = cust.id returning * into cust;

  if rw.stock is not null then
    update public.rewards set stock = stock - 1 where id = rw.id;
  end if;

  -- Off by default too: they are standing at the counter watching you do it.
  perform public.queue_message(p_business, cust.id, 'redeem',
    format('%s: "%s" redeemed. Remaining balance: %s points.', biz.name, rw.title, cust.points_balance),
    jsonb_build_array(biz.name, rw.title, cust.points_balance::text));

  return jsonb_build_object(
    'duplicate', false, 'transaction_id', txn.id, 'reward', rw.title,
    'customer', to_jsonb(cust) - 'card_token'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual adjustment from the dashboard (goodwill, correcting a mistake)
-- ---------------------------------------------------------------------------
create or replace function public.adjust(
  p_business uuid, p_customer uuid, p_points int, p_note text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare cust public.customers;
begin
  if not public.is_member(p_business) then raise exception 'FORBIDDEN'; end if;
  insert into public.transactions (business_id, customer_id, kind, points_delta, channel, note)
  values (p_business, p_customer, 'adjust', p_points, 'dashboard', p_note);
  update public.customers set
    points_balance  = greatest(points_balance + p_points, 0),
    points_lifetime = greatest(points_lifetime + greatest(p_points,0), 0)
  where id = p_customer and business_id = p_business
  returning * into cust;
  update public.customers set tier_id = public.tier_for(p_business, cust.points_lifetime)
    where id = p_customer returning * into cust;
  return to_jsonb(cust) - 'card_token';
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff PIN check (bcrypt via pgcrypto — needs `extensions` on search_path)
-- ---------------------------------------------------------------------------
create or replace function public.verify_staff_pin(p_business uuid, p_pin text)
returns public.staff
language plpgsql
security definer set search_path = public, extensions
as $$
declare s public.staff; h text;
begin
  for s in select * from public.staff where business_id = p_business and active loop
    select pin_hash into h from public.staff_secrets where staff_id = s.id;
    if h is not null and h = crypt(p_pin, h) then return s; end if;
  end loop;
  raise exception 'BAD_PIN';
end;
$$;

create or replace function public.set_staff_pin(p_staff uuid, p_pin text)
returns void
language sql
security definer set search_path = public, extensions
as $$
  insert into public.staff_secrets (staff_id, pin_hash)
  values (p_staff, crypt(p_pin, gen_salt('bf', 10)))
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash;
$$;

-- ---------------------------------------------------------------------------
-- Nightly housekeeping: expire stale points, queue birthday bonuses.
-- Schedule with pg_cron:  select cron.schedule('kadi-daily','0 3 * * *','select public.run_daily_jobs()');
-- ---------------------------------------------------------------------------
create or replace function public.run_daily_jobs()
returns void
language plpgsql
security definer set search_path = public
as $$
declare r record;
begin
  -- expire points that have gone stale
  for r in
    select c.id, c.business_id, c.points_balance, p.points_expire_days, b.name
    from public.customers c
    join public.programs p on p.business_id = c.business_id and p.active
    join public.businesses b on b.id = c.business_id
    where p.points_expire_days is not null
      and c.points_balance > 0
      and c.last_visit_at < now() - make_interval(days => p.points_expire_days)
  loop
    insert into public.transactions (business_id, customer_id, kind, points_delta, channel, note)
    values (r.business_id, r.id, 'expire', -r.points_balance, 'system', 'Points expired');
    update public.customers set points_balance = 0 where id = r.id;
  end loop;

  -- birthday bonuses
  for r in
    select c.id, c.business_id, p.birthday_bonus, b.name
    from public.customers c
    join public.programs p on p.business_id = c.business_id and p.active
    join public.businesses b on b.id = c.business_id
    where p.birthday_bonus > 0 and c.birthday is not null
      and to_char(c.birthday, 'MM-DD') = to_char(now() at time zone b.timezone, 'MM-DD')
      and not exists (
        select 1 from public.transactions t
        where t.customer_id = c.id and t.note = 'Birthday bonus'
          and t.created_at > now() - interval '300 days')
  loop
    insert into public.transactions (business_id, customer_id, kind, points_delta, channel, note)
    values (r.business_id, r.id, 'bonus', r.birthday_bonus, 'campaign', 'Birthday bonus');
    update public.customers
      set points_balance = points_balance + r.birthday_bonus,
          points_lifetime = points_lifetime + r.birthday_bonus
      where id = r.id;
    perform public.queue_message(r.business_id, r.id, 'birthday',
      format('Happy birthday from %s! %s bonus points are on your card.', r.name, r.birthday_bonus),
      jsonb_build_array(r.name, r.birthday_bonus::text));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard stats in one round trip
-- ---------------------------------------------------------------------------
create or replace function public.business_stats(p_business uuid, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_member(p_business) then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'customers',       (select count(*) from public.customers where business_id = p_business),
    'new_customers',   (select count(*) from public.customers
                          where business_id = p_business and created_at > now() - make_interval(days => p_days)),
    'active_30d',      (select count(*) from public.customers
                          where business_id = p_business and last_visit_at > now() - interval '30 days'),
    'lapsed_60d',      (select count(*) from public.customers
                          where business_id = p_business and last_visit_at < now() - interval '60 days'),
    'visits',          (select count(*) from public.transactions
                          where business_id = p_business and kind = 'award'
                            and occurred_at > now() - make_interval(days => p_days)),
    'revenue',         (select coalesce(sum(amount),0) from public.transactions
                          where business_id = p_business and kind = 'award'
                            and occurred_at > now() - make_interval(days => p_days)),
    'repeat_rate',     (select case when count(*) = 0 then 0
                          else round(100.0 * count(*) filter (where visits > 1) / count(*)) end
                          from public.customers where business_id = p_business),
    'points_outstanding', (select coalesce(sum(points_balance),0) from public.customers
                          where business_id = p_business),
    'messages_30d',    (select count(*) from public.messages
                          where business_id = p_business and status = 'sent'
                            and channel = 'whatsapp'
                            and created_at > now() - make_interval(days => p_days)),
    'messages_marketing_30d', (select count(*) from public.messages
                          where business_id = p_business and status = 'sent'
                            and channel = 'whatsapp' and category = 'marketing'
                            and created_at > now() - make_interval(days => p_days)),
    'messages_manual_30d', (select count(*) from public.messages
                          where business_id = p_business and channel = 'manual'
                            and created_at > now() - make_interval(days => p_days)),
    'messages_queued', (select count(*) from public.messages
                          where business_id = p_business and status = 'queued'),
    'redemptions',     (select count(*) from public.transactions
                          where business_id = p_business and kind = 'redeem'
                            and created_at > now() - make_interval(days => p_days)),
    'daily',           (select coalesce(jsonb_agg(d order by d->>'day'), '[]'::jsonb) from (
                          select jsonb_build_object(
                            'day', to_char(day, 'YYYY-MM-DD'),
                            'visits', coalesce(v.n, 0),
                            'revenue', coalesce(v.amt, 0)
                          ) as d
                          from generate_series(
                            date_trunc('day', now() - make_interval(days => p_days - 1)),
                            date_trunc('day', now()), interval '1 day') as day
                          left join (
                            select date_trunc('day', occurred_at) dd, count(*) n, sum(amount) amt
                            from public.transactions
                            where business_id = p_business and kind = 'award'
                              and occurred_at > now() - make_interval(days => p_days)
                            group by 1
                          ) v on v.dd = day
                        ) s)
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down the privileged functions. The till and the public card call these
-- through server routes using the service role; nobody holding an anon or a
-- user token should reach them directly.
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, and Supabase additionally
-- grants to anon/authenticated — so a revoke has to name all three, then hand
-- execute back to service_role only.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.award(uuid, text, numeric, text, uuid, text, timestamptz, text, text, text)',
    'public.redeem(uuid, text, uuid, text, uuid, text, boolean, text)',
    'public.resolve_customer(uuid, text, boolean, text, text)',
    'public.rotate_redeem_code(uuid, int)',
    'public.verify_staff_pin(uuid, text)',
    'public.set_staff_pin(uuid, text)',
    'public.queue_message(uuid, uuid, text, text, jsonb)',
    'public.maybe_queue_milestone(uuid, uuid)',
    'public.run_daily_jobs()',
    'public.gen_card_code(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;