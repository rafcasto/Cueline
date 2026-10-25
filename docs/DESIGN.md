# Cueline — Platform Design

27 Sep 2026, revised 30 Sep 2026 · Rafael Castillo

> **Revision 30 Sep 2026.** The Chrome extension and the speaker-note cue model are dropped. Engagement is authored and launched inside the app: the presenter creates polls, quizzes and word clouds, activates them at any point, sets a timer, and reveals the results as an overlay when it runs out. The deck is uploaded as a PDF and presented in the room. Reactions are always on. A waiting room with image, video or image plus audio and slide-like text opens the session. Reference: univid.io.

## Overview

Cueline is a webinar platform with the engagement built in: the presenter uploads a deck, presents it in the room, and launches polls, quizzes, word clouds and calls to action as overlays that every participant answers on the slide they are already watching.

The wedge is price and ownership. Incumbents charge ~$100/month with capped webinars and bolt on Slido-style tools; Cueline owns the engagement layer, streams broadcast-only viewers over HLS to keep cost at $3–10 per 100-person hour, and sells at $29–79/month.

Build for your own business first, productise later. Three components:

1. **Video room** — 2–3 presenters on WebRTC, 50–100 listen-only viewers on HLS, promote-to-stage in ~1s.
2. **Engagement layer** — polls, Q&A, reactions, hand-raising as Supabase rows with realtime, front end on Vercel. Fully owned.
3. **Presentation and activities** — a PDF deck presented in the room, and presenter-authored activities (poll, quiz, word cloud, CTA) with timers and a results overlay. No Google Slides integration, no extension.

## Component 1 — Video room

Use a third-party transport with server-side participant permissions and built-in HLS egress, so one vendor covers both legs. LiveKit Cloud fits (token grants for publish/subscribe, room-composite egress to HLS); Daily and 100ms are comparable. Verify current per-participant-minute and egress pricing before committing.

### Two connection modes per viewer

| Mode | Transport | Cost basis | When |
| --- | --- | --- | --- |
| Viewer (default) | WebRTC subscriber in the room, publishes nothing | Connection minutes + downstream bandwidth | Everyone on join |
| Fallback | HLS player on the egress playlist, no WebRTC socket | Transcode minutes (shared with the recording) + bucket egress | Room full, WebRTC blocked, or a join that keeps failing |
| Promoted | WebRTC publisher in the room | Connection minutes + bandwidth | While on the stage roster |

> **Revision 25 Oct 2026.** The first build put the whole audience on HLS. Egress writes plain 2 s segments (no LL-HLS), so viewers sat 6–10 s behind and lost audio on every late upload; the 2–5 s assumed below never materialised. The audience now subscribes over WebRTC and HLS is the fallback. LiveKit's current pricing bills connection minutes and bandwidth rather than per-participant real-time premiums, so the cost gap that justified HLS-only is smaller than planned; re-check per-100-viewer-hour cost on the Ship plan.

### Promote-to-stage flow

1. Host taps promote in the host panel; Vercel function checks org role and writes `stage_roster` state `invited`.
2. Viewer client pre-warms: fetches the publish token and runs the camera/mic permission prompt before the host confirms, so the ~1s is only the WebRTC connect.
3. Host confirms; viewer tears down the HLS player, joins the room, publishes. Roster state `live`.
4. Revoke: roster state `revoked` is written first, then the server removes the participant from the room; the client falls back to HLS. Supabase is the source of truth if the vendor call fails.

**Latency.** WebRTC participants are within a second of the presenters and cues show at once. On the HLS fallback a poll that fires the instant the presenter advances would arrive before the slide, so the player reports its live-edge latency and the client schedules each popup at `slide_event.server_ts + measured_latency`. Same rule for CTAs.

**Recording.** One room-composite egress per session writes both the MP4 recording and the HLS segments to object storage (S3/R2); the URLs live on `sessions`. One composite, not two: egress is billed per transcode minute.

## Component 2 — Engagement layer (Supabase)

Every table carries `org_id`; every session-scoped table also carries `session_id`. This is the multi-tenancy foundation from day one.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `organisations` | Tenant | id, name, plan |
| `org_members` | Who can host | org_id, user_id, role (owner / host / presenter) |
| `rooms` | Persistent room, belongs to an org | org_id, slug, branding |
| `sessions` | One live run of a room | room_id, started_at, ended_at, recording_url, presentation_id |
| `presentations` | Uploaded PDF deck | org_id, room_id, storage_path, page_count |
| `participants` | Who is in the session, with the name they entered | session_id, user_id, display_name |
| `activities` | Presenter-authored poll / quiz / word cloud / CTA | room_id, kind, title, options (with `correct`), config, timer_seconds, points |
| `activity_runs` | One activation of an activity in a session | session_id, activity_id, opened_at, closes_at, closed_at, results_shown_at, hidden_at |
| `activity_responses` | Answers; unique on (run_id, user_id); rejected after close; quizzes scored by trigger | run_id, option_ids, text_answer, is_correct, answered_ms |
| `stage_roster` | Promote-to-stage state | session_id, user_id, state (viewer / invited / live / revoked) |
| `slide_events` | Presenter navigated the deck | session_id, presentation_id, page_index, server_ts |
| `questions`, `question_votes` | Q&A with upvotes and moderation flag | — |
| `reactions` | Batched counts per second, not per tap | session_id, kind, count, bucket_ts |
| `hand_raises` | Queue | session_id, user_id, raised_at, cleared_at |
| `cta_events` | Every view/tap/conversion of a CTA run | user_id, run_id, page_index, offset_seconds, action |
| `orders` | Stripe outcome | stripe_session_id, status, cta_event_id |

**Realtime pattern.** Do not have 100 clients subscribe to `postgres_changes` with RLS; Supabase evaluates policies per subscriber per change and it slows down. Instead: write to the table, and a trigger using `realtime.broadcast_changes` pushes to a `session:{id}` broadcast channel that clients listen to. Tallies come from a `run_tallies` view and quiz standings from `quiz_scores`, so the overlay reads a small result set.

**RLS.** Host-side tables: `org_id in (select org_id from org_members where user_id = auth.uid())`. Viewers get a session-scoped anonymous identity (Supabase anonymous auth) with insert-only rights on responses, questions, reactions and hand-raises.

**Front end.** Next.js on Vercel: participant room, host panel, activity overlay. Vercel functions handle anything that needs a service key: token minting, stage changes, session lifecycle, Stripe. Everything else (activities, runs, answers, questions, deck navigation) is a direct Supabase write under RLS.

## Component 3 — Presentation and activities

**Decision:** no Google Slides integration. The deck is a PDF uploaded to Supabase Storage and presented inside the room. The presenter navigates it in the host panel; participants render the same page from the same PDF with pdf.js. The presenter's video sits in a corner of the slide. This removes the extension, the Slides API, the URL-polling assumption and the Chrome Web Store review from the critical path.

### Deck

- Upload a PDF; the client counts pages and stores `storage_path` and `page_count` on `presentations`.
- Each Prev/Next (or arrow key) inserts a `slide_events` row with `page_index`; the broadcast reaches participants, who wait their measured HLS latency before switching pages so the slide changes with the audio.
- Going live inserts the presenter's current page so late joiners land on the right slide.

### Activities

Authored in the host panel and stored per room, so they are reusable across sessions.

| Kind | Options | Timer | Results |
| --- | --- | --- | --- |
| Poll | 2–10 options, single choice | optional | bars with percentages |
| Quiz | 2–10 options, one or more marked correct; points | optional | bars with correct answers marked, plus a leaderboard |
| Word cloud | free text, up to 80 characters | optional | word cloud sized by frequency |
| Call to action | destination (Stripe / embed / tab) and target | none | interactions count |

**Run lifecycle.** Activate inserts an `activity_runs` row. A trigger sets `closes_at = opened_at + timer`. The overlay counts down; the database rejects answers after `closes_at` (2 s grace) or after the presenter closes the run, so the timer is enforced server-side. When time is up the presenter sees "Show results to participants", which sets `results_shown_at` and flips every overlay to the results view. "Hide results" and "Dismiss overlay" follow. Activating a new activity dismisses the previous one.

**Scoring.** A quiz answer is correct when its option set equals the correct set. Points scale from full down to half by how much of the timer was used, so the quickest correct answer wins. `quiz_scores` sums across the session for the leaderboard.

**Overlay.** One component renders every phase: answering, "time's up, waiting for results", results. It sits over the slide, so the participant never leaves the presentation.

### Reactions

Always on: like, heart, laugh, sad, wow, clap. Taps batch client-side and flush once per second through `bump_reaction()`, which upserts a per-second bucket; everyone, host included, sees them float across the video.

### Waiting room

Per room, edited in the host panel like a slide: a backdrop that is a picture or a looping video, a music track that loops over it (or, for a video, its own soundtrack) at a volume the host sets, and text boxes with size, colour, alignment and weight positioned in percent on a 16:9 canvas by dragging. Shown from "Open waiting room" until "Go live", and whenever the room is closed; sound plays only in the waiting state and stops when the stream starts. Participants arrive through the organiser's invite link, already registered with a name and email (see [INVITE-FLOW.md](INVITE-FLOW.md)), and can see how many are waiting.

Sound and autoplay: browsers refuse audible playback until the page has user activation. Client-side navigation from the invite page's *Enter the waiting room* button carries that activation, so the music starts on arrival; a cold load (personal link, refresh) does not, and the canvas shows a *Tap for sound* button instead of attempting an unmuted play that Chrome would pause. A mute toggle sits in the corner either way. The config is one `jsonb` column (`rooms.waiting_room`); the first version's `image_audio` background type is normalised to `image` plus `audio_url` on read, so no migration was needed to make the track independent of the backdrop.

## Calls to action and payments

A CTA is an activity like any other. Prefer the embedded overlay: a new tab mid-presentation kills conversion.

| Destination | How | Notes |
| --- | --- | --- |
| Native (Stripe) | Stripe Embedded Checkout inside the panel; Vercel function creates the Checkout Session with `ui_mode: embedded` and returns the client secret; webhook writes `orders` | Preferred for anything you sell |
| Embedded external | Target URL in an iframe inside the panel | Only works if the site allows framing; most SaaS signup pages send `X-Frame-Options: DENY`. Test at authoring time and fall back automatically |
| New tab | `window.open` | Last resort |

**Own the conversion data.** Log a `cta_events` row on view and on tap, before the checkout loads, so abandonment is captured. Every row carries user, run, page index and `offset_seconds` from session start, which answers "who tapped, at what minute, on which slide".

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
| 1 | One room, presenters, HLS viewers, PDF deck, activities with timers and results, Q&A, reactions, waiting room, recording. No tiers, billing or signup | 3–4 weekends | You run your own webinar on it end to end |
| 2 | Accounts, org auto-created on signup, scheduling page, email invites, PPTX import | — | A second host can run a webinar without you |
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
- [ ] Use the word in-product: "cue" an activity, the "cue panel"
- [x] Name repo, Supabase, Vercel, video vendor and Stripe projects cueline

Not legal advice; have an IP lawyer confirm before spending on branding.

## Open decisions and prototype checklist

- [ ] Pick the video vendor after a pricing check: participant-minute rate, HLS egress rate, recording storage
- [x] Measure real HLS latency on the chosen vendor: 6–10 s with plain segments, which is why the audience moved to WebRTC
- [ ] Check pdf.js render time for a 60-page deck with photos on a mid-range phone
- [x] Decide reactions storage: batched per second via `bump_reaction()`
- [x] Decide participant identity: anonymous auth plus a display name on join
- [ ] Test X-Frame-Options on the first two external CTA targets you plan to embed
- [ ] Decide whether to import PPTX/Google Slides by converting to PDF server-side (Phase 2)

## Implementation notes (what the Phase 1 code does)

- **Session lifecycle.** `waiting` (room open, waiting room shown) → `live` (egress and recording started, deck and activities flow) → `ended`. One open session per room, enforced by a partial unique index.
- **Timer enforcement.** `set_run_close` sets `closes_at` on insert; `check_response` rejects late or closed answers, fills `org_id`/`session_id` from the run, stamps `answered_ms` and scores quizzes. Clients only display the countdown.
- **Dedupe of delayed events.** Participants schedule slide changes and run openings at `server_ts + latency`; the scheduler dedupes by row id.
- **Deck access.** `presentations` are readable by authenticated users only; a participant's anonymous identity is created client-side, so the room fetches the deck after sign-in rather than relying on the server render.
- **Storage.** Public buckets `presentations` (PDF, 50 MB) and `media` (images, video, audio, 100 MB); org members write under `<org_id>/…` and paths are random.
