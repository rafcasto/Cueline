# Cueline — Platform Design

27 Sep 2026 · Rafael Castillo

## Overview

Cueline is a webinar platform where the slides drive the engagement: a presenter types a cue into a Google Slides speaker note, and when that slide comes up the poll or call-to-action pops for every viewer, with results rendered over the slide they are already watching.

The wedge is price and ownership. Incumbents charge ~$100/month with capped webinars and bolt on Slido-style tools; Cueline owns the engagement layer, streams broadcast-only viewers over HLS to keep cost at $3–10 per 100-person hour, and sells at $29–79/month.

Build for your own business first, productise later. Three components:

1. **Video room** — 2–3 presenters on WebRTC, 50–100 listen-only viewers on HLS, promote-to-stage in ~1s.
2. **Engagement layer** — polls, Q&A, reactions, hand-raising as Supabase rows with realtime, front end on Vercel. Fully owned.
3. **Slides integration** — a Chrome extension that reports the current slide and draws results over it, plus a Slides API sync that reads the cues from speaker notes. No Apps Script add-on.

## Component 1 — Video room

Use a third-party transport with server-side participant permissions and built-in HLS egress, so one vendor covers both legs. LiveKit Cloud fits (token grants for publish/subscribe, room-composite egress to HLS); Daily and 100ms are comparable. Verify current per-participant-minute and egress pricing before committing.

### Two connection modes per viewer

| Mode | Transport | Cost basis | When |
| --- | --- | --- | --- |
| Viewer (default) | HLS player only, no WebRTC socket | Egress / bandwidth (~1 GB per viewer-hour) | Everyone on join |
| Promoted | WebRTC publisher in the room | Real-time participant-minutes | While on the stage roster |

### Promote-to-stage flow

1. Host taps promote in the host panel; Vercel function checks org role and writes `stage_roster` state `invited`.
2. Viewer client pre-warms: fetches the publish token and runs the camera/mic permission prompt before the host confirms, so the ~1s is only the WebRTC connect.
3. Host confirms; viewer tears down the HLS player, joins the room, publishes. Roster state `live`.
4. Revoke: roster state `revoked` is written first, then the server removes the participant from the room; the client falls back to HLS. Supabase is the source of truth if the vendor call fails.

**Latency.** HLS viewers sit 2–5s behind the presenters. A poll that fires the instant the presenter advances arrives before the slide. The player reports its live-edge latency; the client schedules each popup at `slide_event.server_ts + measured_latency`. Same rule for CTAs.

**Recording.** Room-composite egress to object storage (S3/R2) per session; store the URL on `sessions`.

## Component 2 — Engagement layer (Supabase)

Every table carries `org_id`; every session-scoped table also carries `session_id`. This is the multi-tenancy foundation from day one.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `organisations` | Tenant | id, name, plan |
| `org_members` | Who can host | org_id, user_id, role (owner / host / presenter) |
| `rooms` | Persistent room, belongs to an org | org_id, slug, branding |
| `sessions` | One live run of a room | room_id, started_at, ended_at, recording_url, presentation_id |
| `deck_slides` | Synced from Slides API | presentation_id, slide_object_id, index, poll_payload, cta_payload |
| `stage_roster` | Promote-to-stage state | session_id, user_id, state (viewer / invited / live / revoked) |
| `slide_events` | Slide changes | session_id, slide_object_id, index, server_ts, forced |
| `polls`, `poll_options`, `poll_responses` | Polls; unique on (poll_id, user_id) | — |
| `questions`, `question_votes` | Q&A with upvotes and moderation flag | — |
| `reactions` | Batched counts per second, not per tap | session_id, kind, count, bucket_ts |
| `hand_raises` | Queue | session_id, user_id, raised_at, cleared_at |
| `ctas`, `cta_events` | CTA definitions and every view/tap/conversion | user_id, cta_id, slide_id, offset_seconds, action |
| `orders` | Stripe outcome | stripe_session_id, status, cta_event_id |

**Realtime pattern.** Do not have 100 clients subscribe to `postgres_changes` with RLS; Supabase evaluates policies per subscriber per change and it slows down. Instead: write to the table, and a trigger using `realtime.broadcast_changes` pushes to a `session:{id}` broadcast channel that clients listen to. Poll tallies come from a `poll_tallies` view or a trigger-maintained counter, so the overlay reads one row.

**RLS.** Host-side tables: `org_id in (select org_id from org_members where user_id = auth.uid())`. Viewers get a session-scoped anonymous identity (Supabase anonymous auth) with insert-only rights on responses, questions, reactions and hand-raises.

**Front end.** Next.js on Vercel: viewer room, host panel, slide-in engagement panel. Vercel functions handle anything that needs a service key: token minting, stage changes, deck sync, Stripe.

## Component 3 — Chrome extension + Slides API sync

**Decision:** a Chrome extension replaces the Google Slides add-on. Apps Script has no presentation-mode API, so an add-on cannot see which slide is showing, and its edits do not reliably re-render in an open presentation window. The extension fixes both and removes the polling-interval caveat.

The extension is the only thing that knows the current slide; everything downstream is ordinary Supabase realtime.

### Three jobs

1. **Report the current slide.** Content script on `docs.google.com/presentation/*` detects present mode and polls `location.href` every ~200ms for the `slide=id.xxx` parameter. Debounce 150ms, dedupe identical ids.
2. **Send it.** POST `{presentation_id, slide_object_id, client_ts}` to `/api/slide-event`. The function validates the host, resolves the active session for that deck, looks up the slide's cue in `deck_slides`, inserts `slide_events`, and the trigger broadcasts.
3. **Render results in present mode.** The content script injects a positioned div over the slide canvas and subscribes to the session channel: tallies, word clouds, hand-raise count, all instant, on the exact window being screen-shared. A small host strip in Google's presenter-view window carries the hand-raise queue, replay-poll and promote-to-stage.

**Deck sync (no add-on).** When a host links a deck, a Vercel function calls the Slides API with `presentations.readonly`, walks `slides[].objectId` and notes text, parses cues into `deck_slides`. Re-sync on session start and via a refresh button.

**Auth handoff.** Declare the web app's origin in `externally_connectable`; one click in the host panel sends a session token via `chrome.runtime.sendMessage`. Store in `chrome.storage.session`. Popup shows "Connected as X · Room Y · Live".

### Edge cases

- Presenter view and audience window both exist; server-side dedupe by slide id.
- Rehearsal with no live session: extension shows "no active session", sends nothing.
- Skipped or reordered slides: index comes from Google's position via re-sync, never a local counter.
- URL not updating in some mode: DOM fallback on the slide counter / aria labels.
- Distribution: load unpacked now; submit an unlisted Chrome Web Store listing early in Phase 2 (review takes days).

## Slide-tag interaction model

Authoring a poll is typing a cue into the slide's speaker notes. Nothing else to configure.

```
#poll: Which channel brings you the most leads? | Email | LinkedIn | Referrals | Paid
#cta: Join the waitlist | embed | https://cueline.app/waitlist
#cta: Buy the course | stripe | price_1Abc...
```

**Flow.** Presenter advances to a tagged slide → extension reports the slide id → function finds the cue in `deck_slides` and inserts a `slide_events` row → broadcast → each viewer's client waits for its measured HLS latency, then slides in the panel with the question → answers land in `poll_responses` → tallies appear on the overlay and in the panel.

**Manual override.** A replay button per poll in the host panel and in the presenter-view strip. It inserts a new `slide_events` row with `forced: true`, so a question can be re-run without touching the deck.

Cue types for Phase 1: single-choice poll, multi-choice poll, open text (word cloud), CTA. Ratings and quizzes can come later with the same parser.

## Calls to action and payments

Same cue mechanism as polls, different payload. Prefer the embedded panel: a new tab mid-presentation kills conversion.

| Destination | How | Notes |
| --- | --- | --- |
| Native (Stripe) | Stripe Embedded Checkout inside the panel; Vercel function creates the Checkout Session with `ui_mode: embedded` and returns the client secret; webhook writes `orders` | Preferred for anything you sell |
| Embedded external | Target URL in an iframe inside the panel | Only works if the site allows framing; most SaaS signup pages send `X-Frame-Options: DENY`. Test at authoring time and fall back automatically |
| New tab | `window.open` | Last resort |

**Own the conversion data.** Log a `cta_events` row on view and on tap, before the checkout loads, so abandonment is captured. Every row carries user, CTA, slide id and `offset_seconds` from session start, which answers "who tapped, at what minute, on which slide".

## Pricing, free tier and economics

Broadcast-only viewers cost roughly $3–10 per 100-person hour (about 1 GB per viewer-hour); full real-time for the same audience is $20–40. That gap is what funds a $29 tier. Figures are estimates; re-check vendor pricing before launch.

| Tier | Price | Attendees | Session cap | Includes |
| --- | --- | --- | --- | --- |
| Free | $0 | 20 | 45 min, 4 sessions/month | Broadcast only, no promote-to-stage (~$1–2 cost per session) |
| Starter | ~$29/month | 100 | 2 hr, unlimited sessions | Chat, polls, recording |
| Pro | ~$79/month | 300 | 2 hr, unlimited sessions | Promote-to-stage, Q&A moderation, branding, analytics |

Incumbents charge ~$100/month with capped webinars; that is the wedge.

**Guardrail.** A Pro customer running 300-person daily sessions could exceed $79 of transport in a week. Keep flat tiers for simplicity but attach an included attendee-hour pool with pennies-per-attendee-hour overage, rather than an uncapped attendee count.

## Multi-tenancy and phased build plan

Rooms belong to an organisation, not a person, from the first migration. Create `organisations` and `org_members` in Phase 1 and hardcode one org for yourself; the RLS policies are cheap, retrofitting `org_id` onto a dozen populated tables is not.

| Phase | Scope | Effort | Done when |
| --- | --- | --- | --- |
| 1 | One room, presenters, HLS viewers, chat, Q&A, polls via extension, recording. No tiers, billing or signup | 3–4 weekends | You run your own webinar on it end to end |
| 2 | Accounts, org auto-created on signup, scheduling page, email invites, unlisted Chrome Web Store listing | — | A second host can run a webinar without you |
| 3 | Pricing tiers, Stripe billing, multi-tenancy hardening, analytics | — | First paying org |

Name every project `cueline` from day one: repo, Supabase, Vercel, video vendor app, Stripe account.

## Name decision: Cueline

Chosen 27 Sep 2026. "The line in your notes that cues the audience": explains the product, carries the stage feel, and turned up no software, app or event product using the name.

| Candidate | Finding | Verdict |
| --- | --- | --- |
| Onstage | webinar.net has an "On Stage" promote-to-stage feature; onstage.io is a musician site builder; internship platform, PM tool, streaming network and Avid app also use it | Rejected, direct category conflict |
| Cuecard | usecuecard.com AI copilot for presentations; open-source CueCard teleprompter syncs Google Slides speaker notes | Rejected |
| Openmic | OpenMic.AI voice agents; OpenMic musician app | Rejected |
| Show of Hands | Show of Hands polling app, 14 years on App Store | Rejected |
| Stagecue | stagecue.com (electronics), .app (video playback), .co (event timing) all held by live-event products | Rejected |
| Sidenote | SideNotes Mac/iOS notes app, Android app of same name; .com and .io held | Runner-up |
| Cueline | No software product found; cueline.com and .io resolve but serve nothing (likely parked); cueline.app has no DNS | **Chosen** |

### Lock-down checklist

- [ ] Register cueline.app
- [ ] WHOIS cueline.com and cueline.io; make an offer or broker request
- [ ] Grab @cueline on X, LinkedIn, YouTube, GitHub, Chrome Web Store developer name
- [ ] Trademark clearance search in NZ (IPONZ) and US (USPTO) for classes 9, 41, 42; file NZ first
- [ ] Use the word in-product: a "cue" in notes, the "cue panel", "Cueline for Google Slides"
- [x] Name repo, Supabase, Vercel, video vendor and Stripe projects cueline

Not legal advice; have an IP lawyer confirm before spending on branding.

## Open decisions and prototype checklist

The load-bearing assumption is that the present-mode URL updates with the slide id. Verify it before writing anything else.

- [ ] Afternoon prototype: open a deck in present mode, confirm `slide=` changes in `location.href` on advance, on both the audience and presenter-view windows
- [ ] Confirm a content script can inject an overlay div above the slide canvas in present mode and that it appears in a screen share
- [ ] Pick the video vendor after a pricing check: participant-minute rate, HLS egress rate, recording storage
- [ ] Measure real HLS latency on the chosen vendor and confirm the player exposes live-edge latency
- [x] Decide reactions storage: broadcast-only vs batched rows (recommendation: batched per second) — batched per second via `bump_reaction()`
- [x] Decide whether Phase 1 viewers need any identity beyond anonymous auth — no; anonymous auth only
- [ ] Test X-Frame-Options on the first two external CTA targets you plan to embed

## Implementation notes (what the Phase 1 code does)

- **Extension architecture.** The background service worker owns all network traffic (slide-event POSTs with the host's bearer token, and the realtime subscription); the content script owns the DOM (URL polling, DOM fallback, Shadow DOM overlay). The content script pings the worker every 20 s over a port to keep it alive while a deck is open.
- **Replay = forced slide event.** `/api/poll/replay` and `/api/slide-event` share `recordSlideEvent`; a forced event opens a fresh poll, a normal one reuses the poll already open for that slide in that session.
- **Dedupe window.** Same slide id reported within 5 s is dropped server-side (audience + presenter-view windows).
- **Viewer inserts** never carry `org_id`; a `before insert` trigger fills it from the session so RLS stays simple.
- **HLS latency.** `delayForEvent` clamps the reading to 0–15 s and falls back to 3 s when the player has no estimate (Safari native HLS).
