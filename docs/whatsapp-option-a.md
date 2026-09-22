# Setting up WhatsApp — Option A (one number, yours)

Every shop sends from a single number you own. Nothing for the shop owner to do,
one set of credentials in your environment, and you pay Meta for what goes out.

Budget about two hours of clicking spread over a few days, most of it waiting for
template approval. You can run the whole system without any of this — messages
just queue up unsent — so do it when you have a shop ready to use it.

---

## Before you start

You need:

- A Facebook account (a personal one is fine to start)
- **A phone number that is not currently on WhatsApp.** Not your personal number,
  not a number running WhatsApp Business app. Once a number moves to the API it
  can no longer be used in either app. Buy a fresh line for this.
- Company documents (certificate of incorporation, a utility bill or bank
  statement with the business address) for verification later

---

## Step 1 — Create the Meta app

1. Go to **developers.facebook.com** and log in.
2. **My Apps → Create App**.
3. Choose the use case **"Connect with customers through WhatsApp"**.
4. Give it a name — "Kadi" — and create it.

You'll land on a WhatsApp **API Setup** panel. Keep this tab; you'll come back
to it several times.

## Step 2 — Create the business portfolio

If you don't already have one, the panel prompts you to create a Meta Business
portfolio. Name it after your company, not after a client — every shop's
messaging runs under it.

This portfolio is where your messaging limits and quality rating live. On
Option A all your shops share both, which is exactly why you'll keep the message
volume low.

## Step 3 — Try it with the test number

Meta gives you a free test number immediately. Use it before spending money.

In **API Setup** you'll see:

- **Phone number ID** — a long number under the test number. This is
  `WHATSAPP_PHONE_NUMBER_ID`.
- **Temporary access token** — click *Generate*. This is `WHATSAPP_TOKEN` for
  now. It dies in about 24 hours.
- **To** — add your own phone number as a test recipient (up to 5 allowed) and
  verify it with the code they send.

Put those two values in `.env.local` and send yourself something:

```bash
curl -X POST "https://graph.facebook.com/v21.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "256772123456",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'
```

If that arrives, the pipe works. If it doesn't, fix it here — everything after
this assumes it does.

## Step 4 — Add your real number

Back in **API Setup → Add phone number**.

1. Enter the business name and the new number.
2. Verify by SMS or voice call.
3. Set the display name — this is what customers see. Meta reviews it, so use
   your actual brand ("Kadi"), not something promotional.

The new number gets its own **Phone number ID**. Swap that into
`WHATSAPP_PHONE_NUMBER_ID`.

## Step 5 — Get a token that doesn't expire

The token from Step 3 expires daily, which is useless in production.

1. **business.facebook.com → Business settings** (gear icon).
2. **Users → System users → Add**. Name it "Kadi server", role **Admin**.
3. **Assign assets** → select your app **and** your WhatsApp account → give
   **Full control** of both.
4. **Generate new token** → choose your app → set expiry to **Never** → tick:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
5. Copy it. **This is shown once.** Put it straight into your password manager
   and into `WHATSAPP_TOKEN`.

## Step 6 — Verify your business

**Business settings → Business info → Start verification.**

Upload your company registration and a document showing the business address.
Approval takes a few days to a couple of weeks.

Until you're verified you can only message **250 unique people per day** across
every shop combined. Verified takes you to 2,000, and it climbs from there as
you sustain volume and keep the quality rating out of the red.

## Step 7 — Create the message templates

This is the part people skip and then wonder why nothing sends. Anything the
system starts — a nudge, a birthday, a broadcast — must use a template Meta
approved in advance.

Go to **business.facebook.com → WhatsApp Manager → Message templates → Create
template**.

Three rules that cause most rejections:

- **Never start or end the body with a variable.** Meta calls these "dangling
  parameters" and rejects them.
- **Never put two variables next to each other.** Put words between them.
- **Fill in a realistic sample for every variable**, or it gets rejected for
  being unreviewable.

Create these five. The variable order matters — it's what the database sends.

---

### `kadi_milestone` — Utility

> Good news from **{{1}}**: you are just **{{2}}** away from **{{3}}**. See you soon!

Samples: `Kikoni Coffee House` · `40 points` · `Free coffee`

This is your workhorse. It covers both points and stamps, which is why the
second variable carries its own unit.

### `kadi_birthday` — Utility

> Happy birthday from **{{1}}**! We have added **{{2}}** bonus points to your card as a small gift.

Samples: `Kikoni Coffee House` · `50`

### `kadi_referral` — Utility

> Good news from **{{1}}**: a friend you referred just shopped with us, so **{{2}}** points have been added. Your balance is now **{{3}}** points. Thank you for sharing!

Samples: `Kikoni Coffee House` · `50` · `390`

### `kadi_broadcast` — Marketing

> A message from **{{1}}**: **{{2}}** Thank you for being a customer.

Samples: `Kikoni Coffee House` · `We miss you! Your points are still waiting.`

Marketing is the expensive category and the one most likely to get you reported
as spam. One a month, at most.

### `kadi_receipt` — Utility (optional)

> Thanks for shopping at **{{1}}**. You earned **{{2}}** and now have **{{3}}**. See you next time!

Samples: `Kikoni Coffee House` · `25 points` · `340 points`

Only needed if a shop switches per-sale receipts on. They're off by default
because they cost more per month than the subscription. Create the template
anyway so it's ready.

Approval usually lands within an hour, sometimes a day.

## Step 8 — Wire it up

```dotenv
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_TOKEN=EAAG...                    # the never-expiring system user token
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_TEMPLATE_MILESTONE=kadi_milestone
WHATSAPP_TEMPLATE_BIRTHDAY=kadi_birthday
WHATSAPP_TEMPLATE_REFERRAL=kadi_referral
WHATSAPP_TEMPLATE_BROADCAST=kadi_broadcast
WHATSAPP_TEMPLATE_RECEIPT=kadi_receipt
```

`WHATSAPP_TEMPLATE_LANG` must match the language you picked when creating the
templates. If you chose "English (US)" it's `en_US`, not `en` — a mismatch here
fails every send with a confusing error.

Then start the outbox worker:

```
* * * * *  curl -sX POST -H "Authorization: Bearer $JOB_SECRET" https://your-domain/api/messages/drain
```

## Step 9 — Check it end to end

1. Enrol yourself at `/join/<shop>` with your own number.
2. Ring up sales on the till until you're within the nudge range of the cheapest
   reward.
3. Watch the queue: `select kind, status, error from messages order by created_at desc limit 5;`
4. Run the drain by hand and see what it says:

```bash
curl -X POST -H "Authorization: Bearer $JOB_SECRET" https://your-domain/api/messages/drain
# {"sent":1,"failed":0,"skipped":0,"examined":1}
```

If a message sits at `failed`, the `error` column has Meta's own words for it.

---

## What normally goes wrong

| What you see | What it means |
|---|---|
| `skipped` and nothing sends | No credentials resolved — check both env vars are actually loaded in the running app |
| "Template name does not exist" | Name mismatch, or `WHATSAPP_TEMPLATE_LANG` doesn't match the template's language |
| "Number of parameters does not match" | You edited a template body and changed its variable count |
| `131047` / "re-engagement message" | It fell back to plain text because no template is configured for that kind |
| Everything sends, nothing arrives | Still on the test number — it only delivers to the 5 verified recipients |
| Sends stop mid-day | You hit the daily unique-recipient cap. Verify your business |

## Keeping the number healthy

On Option A every shop shares your quality rating. One shop blasting weekly
promotions can get your number restricted and take everyone's messaging down
with it.

Worth doing:

- Leave receipts and redemption confirmations off. They're the bulk of the
  volume and none of the value.
- Cap broadcasts to one a month per shop, and check the wording before it goes.
- Watch the quality rating in WhatsApp Manager. If a shop turns yellow,
  talk to them before Meta does.
- When a shop's volume alone justifies it, move them to their own number
  (Option B) — fill in their `business_whatsapp` row and their messages leave
  your pool entirely, along with the bill.
