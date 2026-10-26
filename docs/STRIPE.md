# Stripe setup

25 Oct 2026. What exists in Stripe, created through the API in both modes: the **sandbox** (`acct_1UUNhQPrgcwtAwaD`) and the **live** account (`acct_1UUNhHPrQoeO5F66`, Tertulia, NZ, default currency NZD; prices are in USD). The app resolves prices by **lookup key**, never by id, so the ids below are for reference only. No secrets in this file: keys and the webhook signing secrets live in `.env.local` and Vercel.

## Products and prices

| Product | `metadata.plan` | Price | Lookup key | Sandbox price id | Live price id |
| --- | --- | --- | --- | --- | --- |
| Tertulia Starter (sandbox `prod_VVP6KUx3LyMXkv`, live `prod_VVPU6driZXbwLg`) | `starter` | $29 / month | `starter_monthly` | `price_1UUOITPrgcwtAwaD0c917kpP` | `price_1UUOftPrQoeO5F66uQY8cCpf` |
| | | $290 / year | `starter_yearly` | `price_1UUOITPrgcwtAwaDq0pI35DL` | `price_1UUOftPrQoeO5F66WV6upiQA` |
| Tertulia Pro (sandbox `prod_VVP6GKux2fONjd`, live `prod_VVPUkW3KWOUPMd`) | `pro` | $79 / month | `pro_monthly` | `price_1UUOIUPrgcwtAwaDyLtli08H` | `price_1UUOfuPrQoeO5F660tAOANDe` |
| | | $790 / year | `pro_yearly` | `price_1UUOIUPrgcwtAwaDF8HoXvMq` | `price_1UUOfuPrQoeO5F66DxF4D7K1` |

All prices USD, tax behaviour exclusive, tax code `txcd_10103001` (SaaS, business use), statement descriptor `TERTULIA`. The free tier is not a Stripe object; it is the default of `rooms.plan`. Since 26 Oct 2026 a subscription belongs to a **room**, not an organisation: upgrading the free room buys one, and every further room is bought as another subscription on the same customer. No new Stripe objects were needed for that. The Event Pass product (sandbox `prod_VVP6xMHkHD30eP`, live `prod_VVPUjp7VQBHHup`, lookup key `event_pass`) was dropped from the app on 25 Oct 2026 and should be archived in both Dashboards; the app no longer resolves its lookup key, so a stray checkout for it cannot be created. Participant caps, session caps and minutes are **not** in Stripe metadata: they live in the app's plan limits (see [BUSINESS-MODEL.md](BUSINESS-MODEL.md)). The only metadata the webhook reads is `plan`.

## Customer Portal

Default configuration in each mode (sandbox `bpc_1UUOIlPrgcwtAwaDD3ai7L86`, live `bpc_1UUOhAPrQoeO5F6641lhcqsT`): invoice history, payment method update, email and address update, cancel at period end with a reason, and switching between the four Starter and Pro prices with proration. Return URL `https://tertulia.cloud/host/billing`.

## Launch offer

Coupon 50 % off for three months (sandbox `njXi6nqC`, live `sDTvV7C5`). Promotion code **`TERTULIA50`** in both modes, first purchase only. Checkout must be created with `allow_promotion_codes: true` for the field to appear.

## Webhook

One endpoint per mode, both → `https://tertulia.cloud/api/stripe/webhook` (sandbox `we_1UUOJAPrgcwtAwaDaef1b5fe`, live `we_1UUOfwPrQoeO5F6699FDAqo1`), events:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Each endpoint's signing secret is shown once under Developers → Webhooks in the Dashboard (toggle test/live); put them in `STRIPE_WEBHOOK_SECRET_TEST` and `STRIPE_WEBHOOK_SECRET_LIVE` on Vercel. For local development run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the secret it prints instead.

## How the app uses it

**Two modes at once.** The environment carries both key sets (`STRIPE_SECRET_KEY_TEST` / `_LIVE`, `STRIPE_WEBHOOK_SECRET_TEST` / `_LIVE`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` / `_LIVE`). Which one new checkouts and portal sessions use is `app_settings.stripe_mode`, switched by a **platform admin** at the bottom of `/host/billing` (`pnpm admin:create <email> <password> --super` makes one; the `platform_admins` table holds them). The webhook accepts events from either mode: it tries each configured signing secret and checks `event.livemode` against the one that verified. An organisation remembers the mode its subscription was made in (`organisations.stripe_mode`), so a sandbox subscription keeps renewing against the sandbox after the switch, and *Manage billing* opens the portal on the right account. Create the live webhook endpoint with the same URL and events as the sandbox one; both post to `/api/stripe/webhook`.

**Prices by lookup key.** `apps/web/src/lib/plans.ts` maps `starter_monthly`, `starter_yearly`, `pro_monthly` and `pro_yearly` to the plan they grant; `priceIdFor(mode, key)` asks Stripe for the id, so the same code runs against both accounts. What each plan allows (sessions a month, attendees, minutes, recording, stage slots, Stripe CTA) is `PLAN_LIMITS` in the same file and nowhere in Stripe.

**Routes.** `POST /api/billing/checkout` (owner) returns a hosted Checkout URL. With `{room_id, price}` it upgrades that room, or opens the Customer Portal's plan-change flow when the room already subscribes, so one room never has two subscriptions. With `{org_id, price, new_room: {name, topics}}` it adds a room: refused while the organisation's only room is still free, otherwise the room is created at once with `plan_status = 'unpaid'` (locked) and the checkout carries its id; an abandoned checkout leaves it on the billing page with a *Complete payment* button. `POST /api/billing/portal` opens the portal for the organisation's customer. `GET`/`POST /api/admin/stripe-mode` reads and sets the mode. `POST /api/stripe/webhook` is the only place a plan is granted: `checkout.session.completed` and the `customer.subscription.*` events find the room from the subscription's `room_id` metadata (or `room_subscriptions` by subscription id) and write `rooms.plan`, `rooms.plan_status`, the period and ids in `room_subscriptions`, and the customer on the organisation; `invoice.payment_failed` marks the room past due (it keeps its plan until Stripe cancels); `customer.subscription.deleted` puts the room back on free, which locks it while the organisation has other rooms. `stripe_events` makes a redelivered event a no-op.

**Where the plan bites.** `POST /api/rooms` (create) makes only an organisation's first room, free; the rest go through checkout (platform admins excepted). `POST /api/session/start` refuses a locked room. `POST /api/invites/create` and `/update` cap an event's seats at the room's participants. `queueRegistrationEmails` queues reminders only for a room whose plan includes them, and the webhook's `afterPlanChange` pulls them back or queues them when the room's plan moves, and refills waiting lists when seats grow. `POST /api/session/go-live` counts the room's sessions in the current period (the Stripe period for a paid room, the calendar month for free) against the plan's cap, refuses a locked room, sets LiveKit's `maxParticipants`, starts the recording only when the plan includes it, and stamps `sessions.ends_by`. (Before 26 Oct 2026 the count was per organisation.) `POST /api/token` refuses attendees beyond `max_participants` (in order of arrival) and anyone after `ends_by`. The host panel shows the minutes left and ends the session when they run out; the next go-live in the organisation ends anything overdue server-side. A session that ends within two minutes of going live with nobody in the room is refunded to the count, once per period.

**Testing a purchase locally.** `stripe listen --forward-to localhost:3000/api/stripe/webhook` and put the printed secret in `STRIPE_WEBHOOK_SECRET_TEST`. Buy Starter on `/host/billing` with card `4242 4242 4242 4242`; the plan badge changes when the webhook lands. `stripe trigger customer.subscription.deleted` exercises the downgrade.

## Still to do in the Dashboard (not available through the API)

- Business settings → Public details: name, support email, website, logo, brand colour.
- Settings → Emails: successful payments, refunds and failed payments on.
- Billing → Subscriptions and emails → Manage failed payments: Smart Retries on, then *cancel the subscription* after the last retry (this is what downgrades the org to free).
- Stripe Tax: register and switch on automatic tax in Checkout once a threshold is crossed; prices are already exclusive so nothing needs repricing.
- Create a **restricted key** per mode for the app (write: Checkout Sessions, Customers, Subscriptions, Billing Portal; read: Prices, Products) and use it as `STRIPE_SECRET_KEY_TEST` / `_LIVE` instead of the full secret key. **Roll both secret keys** that were pasted into chat on 25 Oct 2026 (Developers → API keys → Roll key); the objects above stay.
