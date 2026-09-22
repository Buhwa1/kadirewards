# Kadi

Loyalty and rewards infrastructure for African retail. A phone number is the card, a
cheap Android tablet is the terminal, and the terminal keeps working when the internet
doesn't.

Built on Supabase + Next.js, billed over Mobile Money, sold as a flat monthly fee per shop.

```
Owner  →  /dashboard      customers, rewards, campaigns, staff, billing
Cashier→  /till           PIN unlock, keypad, QR scan, offline queue
Customer→ /c/<token>      balance, stamp card, rotating redeem code, referral code
Sign-up→  /join/<slug>    self-enrolment, no app, no install
```

**Deploying it:** see [`DEPLOY.md`](DEPLOY.md) — Supabase + Vercel, free tier, about 45 minutes.

---

## Why this one is different

Most loyalty products assume a stable connection, a smartphone in every customer's hand,
and a trustworthy cashier. None of those hold in a Kampala shop, so the design starts
from what's actually true.

**1. The till is offline-first, not offline-tolerant.**
A sale is written to IndexedDB on the tablet *before* the network is attempted. Every
queued sale carries a UUID idempotency key that the database enforces with a unique
index, so replaying a whole queue after a power cut awards points exactly once. Rejected
items (cooldown, daily cap, unknown card) are surfaced to the cashier instead of retried
forever. Redemption is deliberately online-only — you cannot safely spend a balance you
cannot read — and the UI says so plainly rather than failing mysteriously.

**2. Dual-rail identity.**
`0772123456`, `772123456`, `+256 772 123 456`, the printed card code `4F7QX2`, and the QR
payload `KADI:<shop>:4F7QX2` all resolve to the same customer. Normalisation runs in
Postgres (and is mirrored in TypeScript so the till can validate offline) with calling
codes for UG/KE/TZ/RW/ZM/GH/NG. A customer with a feature phone is a first-class citizen.

**3. Staff fraud is treated as the main threat, because it is.**
Cashiers sign in with a per-person 4-digit PIN, every ledger row is attributed to one of
them, and the PIN hashes live in a table with RLS on and *no policy at all* — no browser
client, not even the owner's, can read one. Redeeming requires a 6-digit code that rotates
every 10 minutes on the customer's own screen, so a cashier can't quietly cash out
someone else's points. A configurable cooldown and daily cap stop the classic
ring-the-same-card-twenty-times-after-closing move.

**4. WhatsApp, not SMS.**
Receipts, birthday bonuses and win-back broadcasts go through the WhatsApp Cloud API:
free to receive, already installed, and the balance link is tappable. Messages queue in an
outbox table, so nothing is lost if credentials aren't configured yet.

**5. Mobile Money billing.**
The subscription is collected over MTN/Airtel Money via Flutterwave. The owner approves a
prompt on the phone they already use for float. No card, no bank visit, no invoice chasing.

**6. Points and stamps in one system.**
A restaurant runs points per shilling. A barber runs buy-nine-get-one stamps. One switch
in settings; the same ledger, rewards, tiers and till.

Plus the ordinary things done properly: tiers with earn multipliers, happy-hour campaigns
evaluated in the shop's own timezone, referrals that pay the referrer on their friend's
first *sale* (not their signup), points expiry, and per-customer reward limits.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Database + auth | Supabase (Postgres) | RLS gives real multi-tenancy; one managed thing to run |
| Business logic | Postgres functions | The till, the offline replay and the dashboard all hit the same rules — no second implementation to drift |
| App | Next.js (App Router) | Server components for the dashboard, one PWA for the till |
| Till storage | IndexedDB + service worker | Survives a dead line and a closed tab |
| QR | `BarcodeDetector` | Ships in Chrome on Android — the device that's actually on the counter. No 300KB polyfill |
| Messaging | WhatsApp Cloud API | Cheap, read, and already on the phone |
| Billing | Flutterwave mobile money | How Ugandan SMEs actually pay |

---

## Getting it running

```bash
npm install
cp .env.example .env.local          # fill in the Supabase keys
supabase db reset                   # applies migrations/ then seed.sql
npm run dev
```

Without the Supabase CLI, paste the three files in `supabase/migrations/` into the SQL
editor in order, then `supabase/seed.sql`.

The seed gives you a working till immediately:

| | |
|---|---|
| Shop code | `kikoni-coffee` |
| PINs | `1234` (Sarah), `5678` (Denis) |
| Till | http://localhost:3000/till |
| Sign-up page | http://localhost:3000/join/kikoni-coffee |

For the dashboard, sign up at `/login` and then attach yourself to the demo shop — the
statement is at the bottom of `seed.sql`. Or just create your own shop through `/onboarding`.

### Environment

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | till + public card routes (server-only) |
| `TILL_SESSION_SECRET` | signs the till's device cookie — 24+ chars |
| `NEXT_PUBLIC_APP_URL` | card links in the dashboard and in WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | sending messages (blank = queue only) |
| `JOB_SECRET` | authorises the two cron routes |
| `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH` | Mobile Money billing |

### Scheduled work

```
* * * * *  curl -sX POST -H "Authorization: Bearer $JOB_SECRET" $APP/api/messages/drain
0 3 * * *  curl -sX POST -H "Authorization: Bearer $JOB_SECRET" $APP/api/jobs/daily
```

`daily` expires stale points, queues birthday bonuses, and marks lapsed subscriptions
past-due. If you'd rather keep it in the database, `select cron.schedule('kadi-daily','0
3 * * *','select public.run_daily_jobs()')` does the first two.

---

## Tests

The rules are the product, so they're tested directly against Postgres.

```bash
./supabase/tests/run.sh                       # spins up a throwaway instance
DB_URL=postgres://... ./supabase/tests/run.sh  # or point at your own
```

43 assertions covering: phone normalisation across four countries, customer creation and
welcome bonus, idempotent replay, cooldown, daily cap, all three identity rails, unknown
card rejection, tier multipliers, referral payout timing, the rotating redeem code
(wrong / expired / single-use), insufficient balance, per-customer limits, blocked cards,
stamp mode, PIN verification, points expiry, the message outbox — plus tenant isolation
between two shops, the anon role seeing nothing, the privileged RPCs being unreachable
with a user token, and PIN hashes being invisible to every browser client.

Two real bugs came out of writing them: an ambiguous column reference in
`resolve_customer`, and a `REVOKE` that missed Postgres's default `PUBLIC` execute grant
and so left `award()` callable with an ordinary user token.

---

## Layout

```
supabase/
  migrations/
    ..._schema.sql       tables, indexes, constraints
    ..._functions.sql    award, redeem, resolve_customer, tiers, campaigns, cron jobs
    ..._rls.sql          row-level security for every tenant table
  seed.sql               demo shop with a month of history
  tests/                 SQL test suite + runner
src/
  app/
    dashboard/           owner: overview, customers, rewards, campaigns, staff, settings
    till/                cashier PWA: PIN lock, keypad, QR scanner, offline queue
    c/[token]/           the customer's card
    join/[slug]/         self-enrolment
    api/till/            login, award, sync, lookup, redeem
    api/card/code        mints the rotating redemption code
    api/billing/         mobile money charge + webhook
    api/messages/drain   WhatsApp outbox worker
    api/jobs/daily       nightly housekeeping
  lib/
    offline.ts           IndexedDB queue + flush
    till-session.ts      signed device cookie
    phone.ts             normalisation, mirrored from SQL
    supabase/            browser / server / service-role clients
```

### Where the logic lives

All of it is in `supabase/migrations/..._functions.sql`. `award()` is the hot path:
idempotency check → subscription check → resolve or create the customer → cooldown and
daily cap → multiplier (tier × live campaign) → ledger row → cached balances → tier
recalculation → referral payout → queue the WhatsApp receipt. The API routes are thin
wrappers that add the session and translate error codes into sentences a cashier can act on.

---

## Selling it

Priced as a flat monthly fee, collected by Mobile Money: **60k starter / 120k growth /
300k chain (UGX)**. Thirty-day trial, no card.

The pitch that lands in a shop is not "loyalty programme" — it's *"you don't know who your
regulars are."* The dashboard answers that on day one: repeat rate, lapsed customers, best
spenders, and one button to WhatsApp everyone who hasn't been in for two months. The
loyalty mechanics are how you collect the data; the win-back message is what pays for the
subscription.

Natural add-on once you're already in the shop doing web or Mobile Money work. Setup is an
afternoon: create the shop, print QR cards, train two cashiers on a four-digit PIN.

### Not built yet

Multi-branch (`chain` is priced but the schema is single-location — `businesses` would gain
a `parent_id` and customers would move up a level), receipt printing, a proper analytics
export, and automatic monthly re-charging (today's billing is one charge per click; a cron
over `paid_through` is the next step).
