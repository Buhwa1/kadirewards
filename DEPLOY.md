# Deploying Kadi

Target: a live URL you can open in front of a shop owner, with a demo shop that
has a month of believable history in it.

Everything here is free. Total time about 45 minutes, most of it waiting.

**You do not need WhatsApp, Flutterwave, a registered company, or a paid domain
to do this.** Those all come later. See the bottom of this file for what each one
unlocks.

---

## 1. Supabase project — 10 minutes

1. supabase.com → **New project**. Free tier.
2. Name it `kadi`, pick a strong database password (save it), region **West EU
   (Ireland)** or **East US** — both are fine from Kampala; Ireland usually wins
   on latency.
3. Wait for it to finish provisioning.

### Run the migrations

**SQL Editor → New query.** Paste and run these in order, one at a time:

```
supabase/migrations/20260910000001_schema.sql
supabase/migrations/20260910000002_functions.sql
supabase/migrations/20260910000003_rls.sql
supabase/seed.sql
```

The seed prints `Demo shop ready` when it works. It creates **Kikoni Coffee
House** with twelve customers, a month of transactions, three lapsed customers,
rewards, tiers and two cashier PINs — enough to demo without typing anything in
live.

If you prefer the CLI: `supabase link --project-ref <ref>` then `supabase db push`.

### Turn off email confirmation

**Authentication → Sign In / Providers → Email → turn OFF "Confirm email".**

Do this before you sign up, or your first account will have no session and the
dashboard will bounce you back to the login page. You can turn it on later.

### Copy your keys

**Project Settings → API:**

| Where it goes | What to copy |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **server only, never commit** |

---

## 2. Push to GitHub — 5 minutes

```bash
git init
git add .
git commit -m "Kadi"
gh repo create kadi --private --source=. --push
```

`.gitignore` already excludes `.env*` and `node_modules`. Check that `git status`
shows no `.env.local` before you push.

---

## 3. Vercel — 10 minutes

1. vercel.com → **Add New → Project** → import the repo.
2. Framework preset: **Next.js** (auto-detected). Don't change the build command.
3. Add the environment variables below, then **Deploy**.

### Environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
TILL_SESSION_SECRET=<32+ random characters>
JOB_SECRET=<24+ random characters>
CRON_SECRET=<24+ random characters>
```

Generate the three secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`NEXT_PUBLIC_APP_URL` must be the URL you will actually open — it's what goes
into customer card links. Set it once you know your domain and redeploy.

Leave every `WHATSAPP_*` and `FLW_*` variable unset for now. Messages queue in
the outbox and the billing button reports that keys aren't configured. Nothing
breaks.

### Make yourself the owner of the demo shop

After the deploy is live:

1. Open `https://your-app.vercel.app/login` and create your account.
2. Back in the Supabase **SQL Editor**, run:

```sql
insert into public.business_members (business_id, user_id, role)
select b.id, u.id, 'owner'
from public.businesses b, auth.users u
where b.slug = 'kikoni-coffee' and u.email = 'you@example.com';
```

3. Reload `/dashboard`. You should see a month of history, a chart, and three
   lapsed customers waiting in Campaigns.

---

## 4. Walk the demo once before you show anyone

| Screen | URL | What to point at |
|---|---|---|
| Dashboard | `/dashboard` | Repeat rate, lapsed count, best customers |
| Till | `/till` — shop code `kikoni-coffee`, PIN `1234` | Ring up 20,000, type any phone number |
| Customer card | Dashboard → any customer → **Open their card** | Balance, QR, rotating code |
| Free win-back | `/dashboard/campaigns` | Tap **Open WhatsApp** on a lapsed customer |
| Sign-up | `/join/kikoni-coffee` | "This is the poster on their counter" |

Test the till **offline**: open it, turn off wifi, ring up a sale. It saves and
says so. Turn wifi back on and watch the counter drain. That demo lands harder
than any slide.

---

## 5. Domain

Your free Vercel URL (`kadi.vercel.app`) works immediately, has HTTPS, and is
fine for the first few pitches. When you want it to look established:

**Vercel → Project → Settings → Domains → Add**, then point the domain's
nameservers or records at Vercel. It issues the certificate automatically.
Remember to update `NEXT_PUBLIC_APP_URL` and redeploy.

---

## What the optional pieces unlock

| Piece | Unlocks | Cost / effort |
|---|---|---|
| Nothing (as deployed) | Cards, till, points, rewards, dashboard, free wa.me win-backs | Free |
| WhatsApp Cloud API | Automatic milestone / birthday / referral messages | Free to set up, per-message fee. See `docs/whatsapp-option-a.md` |
| Flutterwave | Charging shops by Mobile Money in-app | Needs business registration for live keys |
| Registered company | Flutterwave live keys, Meta business verification | URSB |

### Scheduled jobs

`vercel.json` registers two daily crons. Vercel's **Hobby plan only allows one
run per day per job** — anything more frequent fails at deploy time, which is why
both are set to daily.

That is fine while messaging is off. Once WhatsApp is live and you want the
outbox drained more often, either upgrade to Vercel Pro, or point a free external
scheduler at the endpoint:

```
https://your-app.vercel.app/api/messages/drain
Header: Authorization: Bearer <JOB_SECRET>
```

cron-job.org does every-minute schedules on a free account. Both routes answer
GET and POST, so either works.

---

## Checks when something is wrong

| Symptom | Cause |
|---|---|
| Login redirects back to login | Email confirmation still on, or the account isn't confirmed |
| `/dashboard` sends you to `/onboarding` | Your user isn't in `business_members` — run the SQL in step 3 |
| Till says "No shop with that code" | Wrong slug. It's the `businesses.slug` value, `kikoni-coffee` in the demo |
| Card links point at localhost | `NEXT_PUBLIC_APP_URL` is wrong — fix it and redeploy |
| `crypt` / `gen_salt` errors in SQL | pgcrypto isn't in the `extensions` schema. Run `create extension if not exists pgcrypto with schema extensions;` |
| Build fails on fonts | The build machine couldn't reach Google Fonts. Redeploy; it's almost always transient |

## Verifying before you deploy

```bash
npm install
npm run typecheck
npm run build
./supabase/tests/run.sh     # 61 assertions against a throwaway Postgres
```

## Super-admin dashboard

Set `PLATFORM_ADMIN_EMAILS` to a comma-separated list of emails that can open `/admin`
(platform analytics: businesses joined, subscription mix, customer totals).

```
PLATFORM_ADMIN_EMAILS=you@example.com,ops@example.com
```

Also set `NEXT_PUBLIC_APP_URL` (e.g. `https://kadi.app`) so printed sign-up posters
encode the correct absolute join link.
