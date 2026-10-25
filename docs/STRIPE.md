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

## Still to do in the Dashboard (not available through the API)

- Business settings → Public details: name, support email, website, logo, brand colour.
- Settings → Emails: successful payments, refunds and failed payments on.
- Billing → Subscriptions and emails → Manage failed payments: Smart Retries on, then *cancel the subscription* after the last retry (this is what downgrades the org to free).
- Stripe Tax: register and switch on automatic tax in Checkout once a threshold is crossed; prices are already exclusive so nothing needs repricing.
- Create a **restricted key** for the app (write: Checkout Sessions, Customers, Subscriptions, Billing Portal; read: Prices, Products) and use it as `STRIPE_SECRET_KEY` instead of the full secret key.
