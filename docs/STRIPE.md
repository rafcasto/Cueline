# Stripe setup

25 Oct 2026. What exists in the Stripe **sandbox** (account `acct_1UUNhQPrgcwtAwaD`, test mode), created through the API. Repeat the same objects in live mode before launch; the app resolves prices by **lookup key**, never by id, so the live ids may differ. No secrets in this file: keys and the webhook signing secret live in `.env.local` and Vercel.

## Products and prices

| Product | `metadata.plan` | Price | Lookup key | Sandbox price id |
| --- | --- | --- | --- | --- |
| Tertulia Starter (`prod_VVP6KUx3LyMXkv`) | `starter` | $29 / month | `starter_monthly` | `price_1UUOITPrgcwtAwaD0c917kpP` |
| | | $290 / year | `starter_yearly` | `price_1UUOITPrgcwtAwaDq0pI35DL` |
| Tertulia Pro (`prod_VVP6GKux2fONjd`) | `pro` | $79 / month | `pro_monthly` | `price_1UUOIUPrgcwtAwaDyLtli08H` |
| | | $790 / year | `pro_yearly` | `price_1UUOIUPrgcwtAwaDF8HoXvMq` |
| Tertulia Event Pass (`prod_VVP6xMHkHD30eP`) | `event_pass` | $19 one-off | `event_pass` | `price_1UUOIVPrgcwtAwaDvnckOaHC` |

All prices USD, tax behaviour exclusive, tax code `txcd_10103001` (SaaS, business use), statement descriptor `TERTULIA`. The free tier is not a Stripe object; it is the default of `organisations.plan`. Participant caps, session caps and minutes are **not** in Stripe metadata: they live in the app's plan limits (see [BUSINESS-MODEL.md](BUSINESS-MODEL.md)). The only metadata the webhook reads is `plan`.

## Customer Portal

Default configuration `bpc_1UUOIlPrgcwtAwaDD3ai7L86`: invoice history, payment method update, email and address update, cancel at period end with a reason, and switching between the four Starter and Pro prices with proration. Return URL `https://tertulia.cloud/host/billing`.

## Launch offer

Coupon `njXi6nqC`: 50 % off for three months. Promotion code **`TERTULIA50`**, first purchase only. Checkout must be created with `allow_promotion_codes: true` for the field to appear.

## Webhook

Endpoint `we_1UUOJAPrgcwtAwaDaef1b5fe` → `https://tertulia.cloud/api/stripe/webhook`, events:

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

Its signing secret is shown once under Developers → Webhooks in the Dashboard; put it in `STRIPE_WEBHOOK_SECRET` on Vercel. For local development run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the secret it prints instead.

## How the app uses it

**Two modes at once.** The environment carries both key sets (`STRIPE_SECRET_KEY_TEST` / `_LIVE`, `STRIPE_WEBHOOK_SECRET_TEST` / `_LIVE`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` / `_LIVE`). Which one new checkouts and portal sessions use is `app_settings.stripe_mode`, switched by a **platform admin** at the bottom of `/host/billing` (`pnpm admin:create <email> <password> --super` makes one; the `platform_admins` table holds them). The webhook accepts events from either mode: it tries each configured signing secret and checks `event.livemode` against the one that verified. An organisation remembers the mode its subscription was made in (`organisations.stripe_mode`), so a sandbox subscription keeps renewing against the sandbox after the switch, and *Manage billing* opens the portal on the right account. Create the live webhook endpoint with the same URL and events as the sandbox one; both post to `/api/stripe/webhook`.

**Prices by lookup key.** `apps/web/src/lib/plans.ts` maps `starter_monthly`, `starter_yearly`, `pro_monthly`, `pro_yearly` and `event_pass` to what they grant; `priceIdFor(mode, key)` asks Stripe for the id, so the same code runs against both accounts. What each plan allows (sessions a month, attendees, minutes, recording, stage slots, Stripe CTA) is `PLAN_LIMITS` in the same file and nowhere in Stripe.

**Routes.** `POST /api/billing/checkout` (owner; `{org_id, price}`) returns a hosted Checkout URL, or the Customer Portal's plan-change flow when the organisation already subscribes, so one organisation never has two subscriptions. `POST /api/billing/portal` opens the portal. `GET`/`POST /api/admin/stripe-mode` reads and sets the mode. `POST /api/stripe/webhook` is the only place a plan or pass is granted: `checkout.session.completed` and the `customer.subscription.*` events write `organisations.plan`, `plan_status`, the period and the Stripe ids; `invoice.payment_failed` marks the organisation past due (it keeps its plan until Stripe cancels); `customer.subscription.deleted` puts it back on free. Event passes are paid Checkouts in payment mode and become rows in `event_passes`. `stripe_events` makes a redelivered event a no-op.

**Where the plan bites.** `POST /api/session/go-live` counts the organisation's sessions in the current period (the Stripe period for a paid plan, the calendar month for free) against the plan's cap, spends a paid pass when the plan is used up, sets LiveKit's `maxParticipants`, starts the recording only when the plan includes it, and stamps `sessions.ends_by`. `POST /api/token` refuses attendees beyond `max_participants` (in order of arrival) and anyone after `ends_by`. The host panel shows the minutes left and ends the session when they run out; the next go-live in the organisation ends anything overdue server-side. A session that ends within two minutes of going live with nobody in the room is refunded to the count, once per period, and releases its pass.

**Testing a purchase locally.** `stripe listen --forward-to localhost:3000/api/stripe/webhook` and put the printed secret in `STRIPE_WEBHOOK_SECRET_TEST`. Buy Starter on `/host/billing` with card `4242 4242 4242 4242`; the plan badge changes when the webhook lands. `stripe trigger customer.subscription.deleted` exercises the downgrade.

## Still to do in the Dashboard (not available through the API)

- Business settings → Public details: name, support email, website, logo, brand colour.
- Settings → Emails: successful payments, refunds and failed payments on.
- Billing → Subscriptions and emails → Manage failed payments: Smart Retries on, then *cancel the subscription* after the last retry (this is what downgrades the org to free).
- Stripe Tax: register and switch on automatic tax in Checkout once a threshold is crossed; prices are already exclusive so nothing needs repricing.
- Create a **restricted key** per mode for the app (write: Checkout Sessions, Customers, Subscriptions, Billing Portal; read: Prices, Products) and use it as `STRIPE_SECRET_KEY_TEST` / `_LIVE` instead of the full secret key. Roll the sandbox secret key that was pasted into chat on 25 Oct 2026.
- In live mode, recreate the products, prices (same lookup keys), portal configuration, coupon and webhook endpoint; the app finds everything by lookup key.
