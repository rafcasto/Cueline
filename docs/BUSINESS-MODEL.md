# Tertulia — Business model

25 Oct 2026 · Rafael Castillo

Supersedes the *Pricing, free tier and economics* section of [DESIGN.md](DESIGN.md), which assumed LiveKit Cloud. The video server is now self-hosted LiveKit on a Hostinger KVM VPS, and that changes the economics more than anything else in this document.

## The one-line model

Tertulia sells **a room a host owns**: scheduled, branded, with the engagement on the slide (polls, quizzes, word clouds, calls to action, timers, reveals), to an audience the host invites. Hosts pay a flat monthly fee for the size of audience and length of session they are allowed, plus recording. Attendees never pay Tertulia. The free tier is a trial: 20 minutes for 10 participants, unlimited times, with the whole engagement layer switched on, so the first thing a host experiences is the wedge.

## What self-hosting changes

On LiveKit Cloud every viewer-minute and every gigabyte is a variable cost. On a VPS the cost is a **fixed step**: the node costs the same whether 5 or 300 people are watching, until it is full, and then the next step is another node. Three consequences:

1. **Margin per customer is close to 100 %** below capacity. A Starter host running four 50-person, 90-minute sessions a month moves about 200 GB; on Cloud that is roughly $25 of bandwidth against a $29 price, on a KVM 4 it is 1.3 % of the monthly transfer allowance. The VPS is not a stopgap: it is what makes a $29 tier possible. Moving to Cloud later means repricing to roughly $49 / $129 or cutting the caps in half.
2. **The scarce resources are concurrency and recording, not minutes.** The SFU itself is cheap; what fills the box is (a) simultaneous viewers against the uplink and (b) room-composite egress, which runs a headless Chrome plus an encoder and wants 2–4 vCPU per concurrent recording. So tiers are expressed as *participants per session* and *session length*, recording is a paid feature, and the number of sessions recorded at the same time is the first thing that forces a second node.
3. **One node is one region and one point of failure.** Put it where the primary audience is (Hostinger has São Paulo, several European sites, the US and Asia). Attendees on the other side of the world will relay through TURN on that same box. This is acceptable for the first paying hosts and must be said plainly in the terms: no uptime SLA on Free and Starter.

### Capacity of one node (to verify with `lk load-test`)

Assumptions: audience subscribes to one 720p simulcast track at ~1.5 Mbps average (≈0.7 GB per viewer-hour); Hostinger's published transfer allowances; a 1 Gbps port of which ~500 Mbps is usable in practice. Hostinger's own page should be checked for the current price and transfer figure of each plan; third-party listings disagree.

| Node | vCPU / RAM | Transfer / month | Viewer-hours / month on transfer | Concurrent viewers on uplink | Concurrent recordings | Price (24-month, approx.) |
| --- | --- | --- | --- | --- | --- | --- |
| KVM 2 | 2 / 8 GB | 8 TB | ~11,000 | ~300 | 0 (SFU only) | $9–15 |
| KVM 4 | 4 / 16 GB | 16 TB | ~23,000 | ~300 | 1 at 720p | $13–26 |
| KVM 8 | 8 / 32 GB | 32 TB | ~45,000 | ~300 | 2–3 | $26–30 |

The uplink column is the same on every plan because the port, not the CPU, is the ceiling; a bigger plan buys more transfer and more recordings, not more simultaneous viewers. Two levers raise the viewer ceiling without a second node: cap the audience layer at 540p for Free (halves per-viewer bandwidth) and offer an audio-plus-slides mode (the deck is rendered client-side from the PDF, so a 50 kbps audio track still carries the whole presentation).

**Scaling rule.** Keep the SFU and TURN on one KVM 4. Run egress on its own KVM 4 and add one egress node per concurrent recorded session you need to promise. Move to LiveKit Cloud (Ship, $50/month plus $0.12/GB) only when you need a second region or more than three nodes; at that point reprice.

## Fixed cost before the first customer

| Item | $/month |
| --- | --- |
| Hostinger KVM 4, SFU + TURN | 13–26 |
| Hostinger KVM 4, egress (from the first recording customer) | 13–26 |
| Supabase Pro (anonymous attendees count as MAU; decks and media outgrow the free 1 GB) | 25 |
| Vercel Pro (Hobby is non-commercial) | 20 |
| Resend (free to 3,000 emails/month; five emails per registrant → ~600 registrants) | 0–20 |
| Cloudflare R2 for recordings and HLS (no egress fee) | ~2 |
| Domain, sending domain | ~2 |
| **Total** | **~$75–120** |

Break-even is three to four Starter hosts or one Pro host plus one Starter. Everything above that is margin until a node fills.

## Tiers

Univid's free plan is exactly 20 minutes and 10 live attendees, and its first paid plan starts at €99 for 100 live and 4 hours. Zoom Webinars and Livestorm sit at $79–99. The proposed prices sit under all of them on purpose; the free tier matches Univid rather than beating it, and competes on what is *inside* the 20 minutes.

| | Free | Starter | Pro | Event pass |
| --- | --- | --- | --- | --- |
| Price | $0 | $29 / month | $79 / month | $19 per event |
| Participants per session | 10 | 50 | 150 | 50 |
| Session length | 20 min, hard stop | 2 h | 4 h | 3 h, one session |
| Sessions | unlimited | unlimited | unlimited | 1 |
| Polls, quizzes, word clouds, timers, reveals | yes | yes | yes | yes |
| Chat, Q&A, reactions, waiting room | yes | yes | yes | yes |
| Deck | yes | yes | yes | yes |
| Audience video quality | up to 540p | 720p | 720p | 720p |
| Recording | no | MP4 | MP4 + HLS fallback | MP4 |
| Branding | Tertulia mark | accent + logo | accent + logo + CTA, no *Powered by* | accent + logo |
| Promote to stage | no | 1 at a time | 3 at a time | 1 |
| Email sequence | welcome only | welcome + 4 reminders | welcome + 4 reminders, editable | full |
| Call to action with Stripe checkout | no | no | yes | no |
| Fair-use pool | — | 300 participant-hours / month | 1,200 participant-hours / month | 150 |
| Support | community | email | email, 1 business day | email |

**Why these numbers.** Free: 10 × 20 min ≈ 2 GB per session, no recording, no CPU beyond the SFU; it costs nothing measurable and it is enough to run one real quiz with a timer and a reveal. Starter: a coach, teacher or community host running weekly sessions. Pro: the 150 cap keeps one host's single session at half the node's uplink, so two Pro sessions can overlap on one node. Event pass: for the host who runs a webinar twice a year; it also converts people who baulk at a subscription, and it is priced so that two passes cost more than a month of Starter.

**Fair use, not metering.** DESIGN.md proposed an attendee-hour pool with per-hour overage. With a VPS the marginal hour is free until the node fills, so metered billing adds a Stripe usage pipeline for no revenue. Keep the pool as a stated fair-use line (Pro at 1,200 participant-hours is about 840 GB, so nineteen Pro hosts at the full pool fit on one KVM 4's transfer) and enforce the two things that actually protect the node: the participant cap and the session length. Revisit metering if a host regularly exceeds the pool; that host is a candidate for a custom plan on their own node.

**Concurrency.** The participant and length caps bound one host; they do not bound the sum of hosts at 10 a.m. on a Tuesday. Events already have a start time and a plan-derived maximum audience, so the capacity calendar is a query, not a product: sum the caps of events scheduled in each hour and warn (later: refuse or add a node) when the sum approaches the uplink ceiling. Free rooms should also be limited to a small number live at the same time, so a burst of trials cannot push a paying session off the box.

## Who pays and where

Hosts pay through Stripe Billing: a Checkout session in subscription mode for Starter and Pro, a one-off payment for the event pass, and a webhook on `customer.subscription.*` that writes `organisations.plan`. Price in USD with Stripe's local payment methods on; add a EUR and a BRL or MXN price only when the first hosts in those markets ask. Attendees pay nothing to Tertulia; when a host sells through a CTA, the Stripe checkout is the host's own account (Stripe Connect, Phase 3), and Tertulia takes no cut at launch. A platform fee on CTA sales is a later lever once there are enough sales to measure.

## Abuse and cost guardrails

- Hosts sign up with a verified email; Free rooms are created only after verification.
- Free sessions are never recorded and are capped at 540p; no HLS fallback (the fallback is an egress).
- A hard stop ends the session at the cap with a five-minute warning in the host panel and a countdown for attendees; the recording and room are closed server-side, not by the client.
- `maxParticipants` is set on the LiveKit room from the plan, and the token endpoint refuses to mint past the cap, so the limit holds even if a client misbehaves.
- Storage: recordings kept 30 days on Starter, 12 months on Pro, downloadable; a nightly job deletes expired ones.

## What to build for this (Phase 3)

1. **Plan limits in one place.** A `plan_limits` map (participants, minutes, recording, hls, promote slots, branding, stripe CTA, pool) read by every gate below. The `plan` enum already exists on `organisations`; add `event_pass` or a `passes` table keyed to an event.
2. **Gates.** `ensureRoom` passes `maxParticipants`; the token route checks the live count; `startSessionEgress` runs only when the plan includes recording; promote, branding, email steps and CTA destinations check the plan at the API.
3. **Session length.** A per-minute job (Vercel cron on Pro, or `pg_cron`) ends sessions past their cap, stops the egress and deletes the room; the client shows the countdown.
4. **Billing.** Stripe products and prices for the three paid offers; Checkout; webhook; a billing page under `/host`; `stripe_customer_id` and `plan_period_end` on `organisations`.
5. **Usage.** A `session_usage` row per session (peak participants, participant-minutes, recorded minutes) for the fair-use line and, more importantly, for your own capacity planning.
6. **Capacity view.** An admin page summing scheduled audience per hour across all orgs against the node ceiling, so you see the Tuesday problem a week before it happens.

## Assumptions to verify before the pricing page goes up

- [ ] Actual uplink of the Hostinger node and viewers it sustains at 720p and 540p (`lk load-test` from a second machine).
- [ ] CPU of one room-composite egress at 720p30 on the node, and whether the SFU on the same box stays clean while it runs.
- [ ] Hostinger's current transfer allowance and what happens at the cap (throttle or overage).
- [ ] Supabase anonymous MAU count under real attendance, against the Pro plan's included MAU.
- [ ] The Univid free and Growth limits on their live pricing page, and whether a regional price is needed for the first market.
