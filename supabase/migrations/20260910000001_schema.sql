-- ============================================================================
-- Kadi — loyalty & rewards infrastructure for African retail
-- 0001: schema
-- ============================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Businesses (tenants)
-- ---------------------------------------------------------------------------
create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  category            text,
  phone               text,
  address             text,
  currency            text not null default 'UGX',
  country             text not null default 'UG',
  timezone            text not null default 'Africa/Kampala',
  logo_url            text,
  brand_color         text not null default '#0F766E',

  -- billing (Mobile Money subscription)
  plan                text not null default 'starter'
                      check (plan in ('starter','growth','chain')),
  subscription_status text not null default 'trialing'
                      check (subscription_status in ('trialing','active','past_due','canceled')),
  trial_ends_at       timestamptz not null default (now() + interval '30 days'),
  paid_through        timestamptz,
  billing_phone       text,

  -- Which WhatsApp number this shop's messages go out from.
  -- 'shared' = your own platform number (Option A). 'own' = the shop connected
  -- their own WhatsApp Business account (Option B). The label is display-only;
  -- the credentials live in business_whatsapp, which no browser client can read.
  whatsapp_mode       text not null default 'shared'
                      check (whatsapp_mode in ('shared','own','off')),
  whatsapp_sender     text,

  created_at          timestamptz not null default now()
);

-- Owners / managers (real auth users)
create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','manager')),
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Till operators. Not auth users — shops share one cheap tablet at the counter,
-- so staff identify themselves with a 4-digit PIN instead of an email login.
create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.staff (business_id) where active;

-- PIN hashes live in their own table with RLS on and no policy at all, so no
-- browser client can ever read one. A 4-digit PIN's bcrypt hash falls to an
-- offline guess in milliseconds; a manager must not be able to lift a
-- cashier's PIN and then ring up sales in their name.
create table public.staff_secrets (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  pin_hash text not null
);

-- ---------------------------------------------------------------------------
-- Program: one active per business. Two earn models — points or stamp card.
-- ---------------------------------------------------------------------------
create table public.programs (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  name                     text not null default 'Rewards',
  type                     text not null default 'points' check (type in ('points','stamps')),

  -- points model: points earned = floor(amount * points_per_currency * multiplier)
  -- default 0.001 => 1 point per 1,000 UGX spent
  points_per_currency      numeric not null default 0.001,

  -- stamp model
  stamps_required          int not null default 10,
  stamp_min_spend          numeric not null default 0,

  -- earn rules / anti-abuse
  points_expire_days       int,                       -- null = never expire
  award_cooldown_minutes   int not null default 3,    -- same customer, same shop
  max_awards_per_day       int not null default 6,
  max_award_amount         numeric,                   -- flag absurd sales, null = no cap

  -- growth levers
  welcome_bonus            int not null default 0,
  birthday_bonus           int not null default 0,
  referral_bonus_referrer  int not null default 0,
  referral_bonus_referee   int not null default 0,

  -- Messaging. Every business-initiated WhatsApp message costs money, so the
  -- defaults are deliberately mean: a receipt after every sale would cost a
  -- shop more per month than the subscription, and the customer can already
  -- see their balance on their card link for free. What stays on is the small
  -- number of messages that actually bring someone back through the door.
  notify_receipt           boolean not null default false,  -- every sale — expensive, low value
  notify_redeem            boolean not null default false,  -- they're standing at the counter
  notify_milestone         boolean not null default true,   -- "one more stamp" — this one works
  notify_birthday          boolean not null default true,   -- once a year, cheap
  notify_referral          boolean not null default true,   -- rare, and it earns you a customer

  -- how close to the cheapest reward before the milestone nudge fires
  milestone_points_gap     int not null default 50,
  milestone_stamps_gap     int not null default 1,
  milestone_cooldown_days  int not null default 30,

  active                   boolean not null default true,
  created_at               timestamptz not null default now()
);
create unique index programs_one_active_per_business
  on public.programs (business_id) where active;

-- Tiers: lifetime points thresholds, each with an earn multiplier
create table public.tiers (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id) on delete cascade,
  name                 text not null,
  min_points_lifetime  int not null default 0,
  multiplier           numeric not null default 1.0,
  color                text not null default '#64748B',
  sort                 int not null default 0
);
create index on public.tiers (business_id, min_points_lifetime desc);

-- ---------------------------------------------------------------------------
-- Customers. Scoped per business on purpose: a shop's customer list is the
-- shop's asset, and it keeps phone numbers out of a shared global table.
-- ---------------------------------------------------------------------------
create table public.customers (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null references public.businesses(id) on delete cascade,

  -- dual-rail identity: either rail alone is enough to find the card
  phone                   text,          -- E.164, e.g. +256772123456
  card_code               text not null, -- short printable code, e.g. 4F7QX2 (QR payload)
  card_token              text not null, -- long secret for the public card URL /c/<token>

  name                    text,
  birthday                date,

  -- rotating 6-digit code the customer shows to authorise a redemption.
  -- Stops staff from quietly cashing out other people's points.
  redeem_code             text,
  redeem_code_expires_at  timestamptz,

  points_balance          int not null default 0,
  points_lifetime         int not null default 0,
  stamps                  int not null default 0,
  tier_id                 uuid references public.tiers(id) on delete set null,

  referral_code           text not null,
  referred_by             uuid references public.customers(id) on delete set null,
  referral_credited       boolean not null default false,

  whatsapp_opt_in         boolean not null default true,
  blocked                 boolean not null default false,

  visits                  int not null default 0,
  total_spend             numeric not null default 0,
  first_visit_at          timestamptz,
  last_visit_at           timestamptz,
  created_at              timestamptz not null default now()
);
create unique index customers_business_phone on public.customers (business_id, phone)
  where phone is not null;
create unique index customers_business_card_code on public.customers (business_id, card_code);
create unique index customers_card_token on public.customers (card_token);
create unique index customers_business_referral on public.customers (business_id, referral_code);
create index customers_last_visit on public.customers (business_id, last_visit_at desc);

-- ---------------------------------------------------------------------------
-- Rewards catalogue
-- ---------------------------------------------------------------------------
create table public.rewards (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  title              text not null,
  description        text,
  cost_points        int not null default 0,
  cost_stamps        int not null default 0,
  cash_value         numeric,             -- for reporting: what the shop gives up
  stock              int,                 -- null = unlimited
  per_customer_limit int,                 -- null = unlimited
  active             boolean not null default true,
  expires_at         timestamptz,
  sort               int not null default 0,
  created_at         timestamptz not null default now()
);
create index on public.rewards (business_id, active);

-- ---------------------------------------------------------------------------
-- Ledger. Append-only. Balances on customers are a cached projection of this.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  staff_id        uuid references public.staff(id) on delete set null,
  kind            text not null check (kind in ('award','redeem','bonus','adjust','expire')),
  points_delta    int not null default 0,
  stamps_delta    int not null default 0,
  amount          numeric not null default 0,
  reward_id       uuid references public.rewards(id) on delete set null,
  multiplier      numeric not null default 1.0,
  channel         text not null default 'till'
                  check (channel in ('till','self','momo','campaign','system','dashboard')),
  note            text,
  device_id       text,
  idempotency_key text,
  occurred_at     timestamptz not null default now(),  -- client clock (offline sales)
  created_at      timestamptz not null default now()   -- server clock
);
create unique index transactions_idem
  on public.transactions (business_id, idempotency_key)
  where idempotency_key is not null;
create index on public.transactions (business_id, created_at desc);
create index on public.transactions (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Campaigns: happy-hour multipliers and WhatsApp broadcasts
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('multiplier','broadcast')),
  multiplier   numeric default 2.0,
  days_of_week int[],          -- 0=Sunday .. 6=Saturday; null = every day
  hour_start   int,            -- local hour, inclusive
  hour_end     int,            -- local hour, exclusive
  starts_at    timestamptz,
  ends_at      timestamptz,
  audience     text default 'all' check (audience in ('all','lapsed','new','tier')),
  tier_id      uuid references public.tiers(id) on delete cascade,
  lapsed_days  int default 30,
  message      text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on public.campaigns (business_id, active);

-- ---------------------------------------------------------------------------
-- Message outbox (WhatsApp Cloud API / SMS fallback), drained by a worker
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  to_phone    text not null,

  -- 'manual' is the shop owner sending from their own phone through a wa.me
  -- link. It costs nothing and Meta never sees it, so it is logged for history
  -- and de-duplication but excluded from every cost figure.
  channel     text not null default 'whatsapp'
              check (channel in ('whatsapp','sms','manual')),

  kind        text not null
              check (kind in ('receipt','redeem','milestone','birthday','referral','broadcast')),
  -- what Meta will bill this as, so the dashboard can show what messaging costs
  category    text not null default 'utility'
              check (category in ('utility','marketing','service')),

  -- Business-initiated WhatsApp messages must use a pre-approved template.
  -- body is the rendered sentence — a readable preview in the dashboard, and
  -- the payload used inside an open 24-hour service window; params are the
  -- template's positional variables.
  body        text not null,
  params      jsonb not null default '[]'::jsonb,

  status      text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error       text,
  provider_id text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index on public.messages (status, created_at) where status = 'queued';
create index on public.messages (business_id, created_at desc);
create index on public.messages (customer_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- WhatsApp credentials, one row per business. Same pattern as staff_secrets:
-- RLS on, no policy, so only the service role ever reads an access token.
--
-- Option A (shared): leave this empty for every shop. The outbox falls back to
-- the platform-wide credentials in the environment and everything goes out
-- from your own number.
-- Option B (own): a shop connects their own WhatsApp Business account through
-- Embedded Signup and their row is filled in — same code path, different
-- sender, and Meta bills them rather than you.
-- ---------------------------------------------------------------------------
create table public.business_whatsapp (
  business_id        uuid primary key references public.businesses(id) on delete cascade,
  phone_number_id    text,
  waba_id            text,
  access_token       text,

  -- names of the shop's own approved templates; null falls back to the
  -- platform templates named in the environment
  template_receipt   text,
  template_milestone text,
  template_birthday  text,
  template_referral  text,
  template_broadcast text,
  template_lang      text not null default 'en',

  updated_at         timestamptz not null default now()
);

-- Mobile Money subscription events (Flutterwave / MTN MoMo collections)
create table public.subscription_events (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  provider    text not null default 'flutterwave',
  reference   text,
  amount      numeric,
  currency    text default 'UGX',
  status      text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create unique index on public.subscription_events (provider, reference)
  where reference is not null;

-- Till device sessions (audit trail of which tablet is logged in as whom)
create table public.till_devices (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  device_id    text not null,
  label        text,
  last_seen_at timestamptz not null default now(),
  unique (business_id, device_id)
);
