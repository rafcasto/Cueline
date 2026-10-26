# Tertulia — Business model

25 Oct 2026 · Rafael Castillo

Supersedes the *Pricing, free tier and economics* section of [DESIGN.md](DESIGN.md), which assumed LiveKit Cloud. The video server is now self-hosted LiveKit on a Hostinger KVM 8 VPS (8 vCPU, 32 GB RAM, 32 TB transfer a month, about $26–30 a month), and that changes the economics more than anything else in this document.

## The one-line model

Tertulia sells **a room a host owns**: scheduled, branded, with the engagement on the slide (polls, quizzes, word clouds, calls to action, timers, reveals), to an audience the host invites. Hosts pay a flat monthly fee for the size of audience and length of session they are allowed, plus recording. Attendees never pay Tertulia. The free tier is a trial: one 20-minute session a month for 10 participants, with the whole engagement layer switched on, so the first thing a host experiences is the wedge.

## What self-hosting changes

On LiveKit Cloud every viewer-minute and every gigabyte is a variable cost. On a VPS the cost is a **fixed step**: the node costs the same whether 5 or 300 people are watching, until it is full, and then the next step is another node. Three consequences:

1. **Margin per customer is close to 100 %** below capacity. A Starter host running four 50-person, 90-minute sessions a month moves about 200 GB; on Cloud that is roughly $25 of bandwidth against a $29 price, on the KVM 8 it is 0.6 % of the monthly transfer allowance. The VPS is not a stopgap: it is what makes a $29 tier possible. Moving to Cloud later means repricing to roughly $49 / $129 or cutting the caps in half.
2. **The scarce resources are concurrency and recording, not minutes.** The SFU itself is cheap; what fills the box is (a) simultaneous viewers against the uplink and (b) room-composite egress, which runs a headless Chrome plus an encoder and wants 2–4 vCPU per concurrent recording. So tiers are expressed as *participants per session* and *session length*, recording is a paid feature, and the number of sessions recorded at the same time (two, perhaps three, on the KVM 8 while the SFU runs beside them) is the first thing that forces a second node.
3. **One node is one region and one point of failure.** Put it where the primary audience is (Hostinger has São Paulo, several European sites, the US and Asia). Attendees on the other side of the world will relay through TURN on that same box. This is acceptable for the first paying hosts and must be said plainly in the terms: no uptime SLA on Free and Starter.

### Capacity of the node (to verify with `lk load-test`)

Assumptions: audience subscribes to one 720p simulcast track at ~1.5 Mbps average (≈0.7 GB per viewer-hour); Hostinger's published transfer allowance; a 1 Gbps port of which ~500 Mbps is usable in practice. The KVM 8 row is the node you have; the smaller rows show what a second, cheaper node would add if it is ever needed.

| Node | vCPU / RAM | Transfer / month | Viewer-hours / month on transfer | Concurrent viewers on uplink | Concurrent recordings | Price (24-month, approx.) |
| --- | --- | --- | --- | --- | --- | --- |
| **KVM 8 (current)** | 8 / 32 GB | 32 TB | ~45,000 | ~300 | 2–3 with the SFU on the same box | $26–30 |
| KVM 4 | 4 / 16 GB | 16 TB | ~23,000 | ~300 | 1 at 720p | $13–26 |
| KVM 2 | 2 / 8 GB | 8 TB | ~11,000 | ~300 | 0 (SFU only) | $9–15 |

The uplink column is the same on every plan because the port, not the CPU, is the ceiling; the KVM 8 buys transfer and recordings, not more simultaneous viewers. 45,000 viewer-hours a month is far beyond what the first year of hosts will use: at the Pro fair-use pool it is thirty-seven Pro hosts at full use. Two levers raise the viewer ceiling without a second node: cap the audience layer at 540p for Free (halves per-viewer bandwidth) and offer an audio-plus-slides mode (the deck is rendered client-side from the PDF, so a 50 kbps audio track still carries the whole presentation).

**Scaling rule.** Everything runs on the KVM 8: SFU, TURN, Redis and the egress service. The first limit you will hit is concurrent recordings, not transfer or CPU for the SFU. When you need to promise more than two recorded sessions at the same time, add a KVM 4 as a dedicated egress node (one per extra concurrent recording) and leave the SFU where it is. Move to LiveKit Cloud (Ship, $50/month plus $0.12/GB) only when you need a second region or more than three nodes; at that point reprice.

## Fixed cost before the first customer

| Item | $/month |
| --- | --- |
| Hostinger KVM 8: SFU, TURN, Redis and egress on one box | 26–30 |
| Supabase Pro (anonymous attendees count as MAU; decks and media outgrow the free 1 GB) | 25 |
| Vercel Pro (Hobby is non-commercial) | 20 |
| Resend (free to 3,000 emails/month; five emails per registrant → ~600 registrants) | 0–20 |
| Cloudflare R2 for recordings and HLS (no egress fee) | ~2 |
| Domain, sending domain | ~2 |
| **Total** | **~$75–100** |

Break-even is three Starter hosts or one Pro host. Everything above that is margin until the node fills.

## Tiers

Univid's free plan is exactly 20 minutes and 10 live attendees, and its first paid plan starts at €99 for 100 live and 4 hours. Zoom Webinars and Livestorm sit at $79–99. The proposed prices sit under all of them on purpose; the free tier matches Univid rather than beating it, and competes on what is *inside* the 20 minutes.

| | Free | Starter | Pro |
| --- | --- | --- | --- |
| Price | $0 | $29 / month | $79 / month |
| Participants per session | 10 | 50 | 150 |
| Seats per event | host's choice, up to 10, waiting list beyond | up to 50, waiting list beyond | up to 150, waiting list beyond |
| Session length | 20 min, hard stop | 2 h | 4 h |
| Sessions | 1 per month | 4 per month | unlimited, within fair use |
| Rooms | 1 included; more at $19 each, one-off | 1 included; more at $19 each, one-off | 1 included; more at $19 each, one-off |
| Polls, quizzes, word clouds, timers, reveals | yes | yes | yes |
| Chat, Q&A, reactions, waiting room | yes | yes | yes |
| Deck | yes | yes | yes |
| Audience video quality | up to 540p | 720p | 720p |
| Recording | no | MP4 | MP4 + HLS fallback |
| Branding | Tertulia mark | accent + logo | accent + logo + CTA, no *Powered by* |
| Promote to stage | no | 1 at a time | 3 at a time |
| Email sequence | welcome and waiting-list note only | welcome, waiting-list note + 4 reminders | welcome, waiting-list note + 4 reminders, editable |
| Call to action with Stripe checkout | no | no | yes |
| Fair-use pool | — | 300 participant-hours / month | 1,200 participant-hours / month |
| Support | community | email | email, 1 business day |

Yearly prices are ten months for twelve ($290 and $790), so the landing page can say "two months free" without a discount code.

There is no per-event pass (removed 25 Oct 2026, after a day). A fourth price split the decision on the landing page three ways and gave a Starter host at the cap a $19 exit instead of the Pro upgrade; two passes also cost more than a month of Starter, which made it a worse deal the page then had to explain. A host at the cap now sees one step: the next plan. If hosts who run a webinar twice a year turn out to matter, the answer is a monthly plan they cancel, which the portal already allows, not a fourth product.

**Rooms.** A room is the unit a host owns, so every plan includes exactly one and the second is a purchase rather than a plan feature: a one-off $19 (Stripe lookup key `extra_room`), kept on every plan and counted on the organisation. A host who needs several standing communities pays per community; one who runs several kinds of event in one community uses several events in the one room. Platform admins are not capped. The price is a first guess and is nowhere in the code but `EXTRA_ROOM` in `plans.ts` and the Stripe price itself.

**Seats and the waiting list.** The participant cap bounds the session; the host chooses how many of those seats an event offers, and registrations beyond it wait in order of arrival. Someone who cannot come frees their seat from any email or the event page, and the first in line takes it with an email to say so. This is what makes the cap livable on Free: ten seats fill, the rest queue, and the reminders (on paid plans) keep asking the no-shows to step aside.

**Why these numbers.** Free: 10 × 20 min ≈ 2 GB per session, no recording, no CPU beyond the SFU; it costs nothing measurable and it is enough to run one real quiz with a timer and a reveal. One a month keeps it a trial rather than a free plan. Starter: the weekly host; a fifth session in the month is the signal to move to Pro. Pro: the host running several sessions a week, or a bigger room; the 150 cap keeps one host's single session at half the node's uplink, so two Pro sessions can overlap on the node, which matches the two recordings it can run at once.

**Session caps.** A session counts the moment the host presses *Go live*; opening the waiting room, rehearsing, or scheduling an event does not. The month is the billing period for paid plans and the calendar month for Free. At the cap, *Go live* is refused with the upgrade in its place; the host can still create and schedule events, with a warning that the session will need an upgrade. A session that ends within two minutes with no attendee ever connected is refunded to the count once per month, so a false start does not burn the only free session. Pro is unlimited in count and bounded by the fair-use pool below.

Starter covers the weekly host at $29, which is the buyer Univid and Zoom price at $79–99. What moves a host to Pro is audience (over 50), length (over 2 hours), the fallback stream, more guests on stage and the Stripe call to action, and, for the host who hits four, session count. If Starter hosts regularly hit the cap and churn instead of upgrading, raise the cap rather than cut Pro's price.

**Fair use, not metering.** DESIGN.md proposed an attendee-hour pool with per-hour overage. With a VPS the marginal hour is free until the node fills, so metered billing adds a Stripe usage pipeline for no revenue. Keep the pool as a stated fair-use line (Pro at 1,200 participant-hours is about 840 GB, so thirty-seven Pro hosts at the full pool fit in the KVM 8's transfer) and enforce the two things that actually protect the node: the participant cap and the session length. Revisit metering if a host regularly exceeds the pool; that host is a candidate for a custom plan on their own node.

**Concurrency.** The participant and length caps bound one host; they do not bound the sum of hosts at 10 a.m. on a Tuesday. Events already have a start time and a plan-derived maximum audience, so the capacity calendar is a query, not a product: sum the caps of events scheduled in each hour and warn (later: refuse or add a node) when the sum approaches the uplink ceiling. Free rooms should also be limited to a small number live at the same time, so a burst of trials cannot push a paying session off the box.

## Who pays and where

Hosts pay through Stripe Billing: a Checkout session in subscription mode for Starter and Pro, and a webhook on `customer.subscription.*` that writes `organisations.plan`. Price in USD with Stripe's local payment methods on; add a EUR and a BRL or MXN price only when the first hosts in those markets ask. Attendees pay nothing to Tertulia; when a host sells through a CTA, the Stripe checkout is the host's own account (Stripe Connect, Phase 3), and Tertulia takes no cut at launch. A platform fee on CTA sales is a later lever once there are enough sales to measure.

## Abuse and cost guardrails

- Hosts sign up with a verified email; Free rooms are created only after verification.
- Free sessions are never recorded and are capped at 540p; no HLS fallback (the fallback is an egress).
- A hard stop ends the session at the cap with a five-minute warning in the host panel and a countdown for attendees; the recording and room are closed server-side, not by the client.
- `maxParticipants` is set on the LiveKit room from the plan, and the token endpoint refuses to mint past the cap, so the limit holds even if a client misbehaves.
- Storage: recordings kept 30 days on Starter, 12 months on Pro, downloadable; a nightly job deletes expired ones.

## What to build for this (Phase 3)

Built 25 Oct 2026 (items 1–4 and most of 5; see [STRIPE.md](STRIPE.md)): plan limits, the go-live, participant and recording gates, the hard stop, Stripe Checkout and Portal, the webhook, the billing page, and a sandbox/live switch for platform admins. Still open: a per-minute sweep (the hard stop is enforced by the host panel and at the next go-live), the admin capacity view, and the branding, email-step and promote-slot gates.

1. **Plan limits in one place.** A `plan_limits` map (sessions per month, participants, minutes, recording, hls, promote slots, branding, stripe CTA, pool) read by every gate below. The `plan` enum already exists on `organisations`.
2. **Gates.** `ensureRoom` passes `maxParticipants`; the token route checks the live count; the go-live route counts this period's sessions for the org against the plan's cap before it starts anything; `startSessionEgress` runs only when the plan includes recording; promote, branding, email steps and CTA destinations check the plan at the API.
3. **Session length.** A per-minute job (Vercel cron on Pro, or `pg_cron`) ends sessions past their cap, stops the egress and deletes the room; the client shows the countdown.
4. **Billing.** Stripe products and prices for the two paid plans; Checkout; webhook; a billing page under `/host`; `stripe_customer_id` and `plan_period_end` on `organisations`.
5. **Usage.** A `session_usage` row per session (peak participants, participant-minutes, recorded minutes) for the fair-use line and, more importantly, for your own capacity planning.
6. **Capacity view.** An admin page summing scheduled audience per hour across all orgs against the node ceiling, so you see the Tuesday problem a week before it happens.

## Assumptions to verify before the pricing page goes up

- [ ] Actual uplink of the Hostinger node and viewers it sustains at 720p and 540p (`lk load-test` from a second machine).
- [ ] CPU of one room-composite egress at 720p30 on the node, and whether the SFU stays clean with two or three running at once; this number sets how many recorded sessions you can promise concurrently.
- [ ] Hostinger's current transfer allowance and what happens at the cap (throttle or overage).
- [ ] Supabase anonymous MAU count under real attendance, against the Pro plan's included MAU.
- [ ] The Univid free and Growth limits on their live pricing page, and whether a regional price is needed for the first market.
