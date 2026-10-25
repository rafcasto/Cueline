# Tertulia

[tertulia.cloud](https://tertulia.cloud) (formerly Cueline). Webinars with the engagement built in. The presenter uploads a deck as a PDF, presents it in the room, and launches polls, quizzes, word clouds and calls to action as overlays for everyone watching. Each activity can carry a timer; when it runs out the presenter reveals the results as an overlay. Participants react at any time and see a waiting room before the session starts.

The full design is in [docs/DESIGN.md](docs/DESIGN.md); a feature and landing-page comparison with Univid is in [docs/COMPETITOR-UNIVID.md](docs/COMPETITOR-UNIVID.md); tiers, costs and capacity on the self-hosted LiveKit node are in [docs/BUSINESS-MODEL.md](docs/BUSINESS-MODEL.md). This repo is the Phase 1 build: rooms the host creates (each with its own events, email sequence, deck, activities and waiting room), presenters on WebRTC, viewers on HLS, PDF deck, activities, Q&A, reactions, waiting room, recording. No tiers, billing or signup yet.

## Layout

| Path | What |
| --- | --- |
| `supabase/migrations` | Schema. Every table carries `org_id`; session tables carry `session_id`. RLS, the `session:{id}` broadcast trigger, timer and quiz-scoring triggers, `run_tallies` and `quiz_scores` views, storage buckets, room email sequences and their inheritance by events. |
| `supabase/tests` | Stubs + smoke test that exercise the migration against plain Postgres (`pnpm db:test`). |
| `apps/web` | Next.js on Vercel: landing page (`/`), invite link and registration (`/join/[token]`), the typed door (`/join`, email + code) and the personal link (`/a/[token]`), participant room (`/r/[slug]`), the host's rooms (`/host`) and the host panel per room (`/host/[slug]`), and the functions that need the service key (`/api/*`). |

## How it fits together

**Landing page.** Two doors: *Log in as host* and *Join a room*. Attendees who already registered join with the email and the six-character code from their welcome email, or skip the typing with the personal link in that email.

**Rooms.** A host creates as many rooms as they need from `/host`. A room is a standing space: its own events and invite links, email sequence, deck, activities, waiting room and branding. The Settings tab renames it, changes its `/r/` address, sets its branding, or deletes it (which cancels the reminders still scheduled for its registrants).

**Branding.** Per room (`rooms.branding`, helpers in `apps/web/src/lib/branding.ts`): an accent colour, a logo and a standing call to action. The accent is applied as CSS variables on the room and on the invite page, so every button, badge, chosen answer and result bar takes the room's colour; the text on it flips to dark for light colours. The logo (PNG/JPEG/WebP/GIF in the `media` bucket) replaces the product mark in the room header and sits by the room name on the invite page. The call to action is a label and an https link, shown as a button in the room header (and under the stage on phones) for the whole session. The Settings tab previews all three with the real components before saving; `/api/rooms` validates the colour and the links.

**Invite link and registration.** The organiser creates an event (title, start time, blurb) in the host panel, which is also an invite link. Attendees open `/join/<token>`, register with a name and email, and the same page becomes the door on the day: its button follows the session state. `/r/<slug>` sends anyone without a registration to the room's current link; org members walk in. Registrations bind to the attendee's anonymous identity; the personal link (`/a/<token>`) and the email + code form re-bind it, so a second device works. The host panel shows *registered* against *joined*. The reasoning and what to measure are in [docs/INVITE-FLOW.md](docs/INVITE-FLOW.md).

**Event emails.** Each room carries an email sequence: a welcome sent on registration with the personal link and code, then reminders at 48 hours, 24 hours, 2 hours and 15 minutes before the start. Every event created in the room inherits the sequence, and the send times are counted back from that event's start. The host edits copy and timing once per room in the Emails tab; the change reaches every open event and reschedules it at Resend, and changing an event's start time moves its reminders. Details in [docs/EMAILS.md](docs/EMAILS.md).

**Plans and billing.** Free, Starter and Pro with the caps in [docs/BUSINESS-MODEL.md](docs/BUSINESS-MODEL.md), paid through Stripe Checkout from `/host/billing`; an event pass adds one session. The plan is enforced when a session goes live (sessions this month, audience cap on the LiveKit room, recording only where included, a hard stop on length) and when attendees ask for a token. Both Stripe modes are configured at once and a platform admin (`pnpm admin:create … --super`) switches new payments between the sandbox and the live account on the billing page. Wiring in [docs/STRIPE.md](docs/STRIPE.md).

**Video room.** LiveKit Cloud behind `apps/web/src/lib/video.ts`. Everyone joins the room over WebRTC: presenters and promoted participants publish, the audience subscribes only (`LiveViewer`), so they hear and see the presenters with sub-second latency. One room-composite egress per session writes the recording and an HLS playlist; the playlist is the fallback (`HlsPlayer`) when the room cannot take a participant or a join keeps failing, and sits 6-10 s behind. It takes a few seconds to appear after "Go live", so the player keeps asking for it (and reconnects after a drop) instead of giving up; where the browser refuses autoplay with sound either view starts muted and shows *Tap for sound*. The bucket behind `RECORDING_PUBLIC_BASE_URL` must allow cross-origin GETs from the app and must not cache `.m3u8` files, or hls.js can neither fetch nor follow the live playlist. Promote-to-stage is `stage_roster` state (`viewer → invited → live → revoked`).

**Deck.** A PDF in the `presentations` storage bucket. The presenter steps through it (arrow keys or buttons); each navigation inserts a `slide_events` row and every participant renders that page from the same PDF with pdf.js.

**Stage layout.** Where the presenter video sits against the deck page, chosen by the host in the live panel: *Corner* (the deck with the camera bottom-right, the default), *Talking head* (the camera fills the stage, the deck is hidden), *Side by side* (deck left, camera right, half each) or *Custom* (the host drags the camera anywhere on the stage and resizes it from its corner; arrow keys nudge it, plus and minus resize it). The host's stage is the same component attendees see (`StageCanvas`), around the host's own camera, so what the host sees is what attendees get; dragging the camera in any preset switches to custom from where it was. The layout is one `jsonb` on the session (`sessions.layout`, helpers in `apps/web/src/lib/stage-layout.ts`), so a change rides the session broadcast and attendees follow at once; the room keeps the last choice (`rooms.stage_layout`) as the starting layout of the next session. Geometry is in percent of a 16:9 stage, where a 16:9 box is as tall as it is wide, so a custom position stores only `x`, `y` and `w`.

**Activities.** The presenter authors polls, quizzes (with correct answers and points), word clouds and CTAs in the host panel, each with an optional timer. Activating one inserts an `activity_run`; a trigger sets `closes_at` from the timer. Participants answer in an overlay that is never taller than the screen: it is capped at the height of the layer it sits in and scrolls inside, and on phones (below `lg`) that layer is the viewport rather than the short slide strip, so a long quiz is reached by scrolling the card instead of being clipped. The database rejects answers after the timer or after the presenter closes the run, and scores quizzes server-side. "Show results to participants" flips `results_shown_at` and the overlay switches to tallies, the word cloud, or the quiz leaderboard. "Hide from participants" sets `hidden_at` and "Show to participants" clears it, at any time and as often as needed (a call to action has only these two); the run keeps its answers either way, and activating from the library starts a fresh run. Participants fetch an activity with its run, so one created or edited while they were already in the room still shows.

**Realtime.** One broadcast channel per session. Clients never subscribe to `postgres_changes`; a trigger calls `realtime.broadcast_changes` on every write and the client applies a reducer (`apps/web/src/lib/session-state.ts`). The snapshot is taken once the channel is subscribed and again after every reconnect, since broadcasts missed while offline never replay; viewers subscribe only once their anonymous identity exists, because the private channel and most tables need it. Participants delay slide changes and activity openings by the transport's live-edge latency so they land with the video: 0 over WebRTC, the player's estimate on the HLS fallback, 0 while nothing is playing.

**Chat.** One message stream per session, next to Q&A: attendees chat while the doors are open and during the session, hosts chat from the live panel. In the live room the chat and Q&A panel is as tall as the stage beside it and its list scrolls inside, with the composer fixed at the bottom; on phones it follows the stage. Messages are rows in `chat_messages` and arrive through the same broadcast; the database fills the org, trims the body, only accepts messages from someone in the room while the session is open, and holds a sender to five messages in ten seconds. The host hides a message (it leaves every screen; its author sees it was removed; the host can restore it) and switches chat off per room in Settings.

**Reactions.** Like, heart, laugh, sad, wow, clap. Taps batch client-side and land as one row per second per kind through `bump_reaction()`; everyone sees them float.

**Waiting room.** Per room: a picture or a looping video as the backdrop, music that loops on top (or the video's own sound), and text boxes positioned on a 16:9 canvas in a small slide-like editor with a sound preview. Shown while the session is `waiting` and when the room is closed; the music plays only while attendees wait and stops when the host goes live. Browsers hold sound back until the page has had a tap: attendees who come through the invite page's button already have one and hear it straight away, anyone who lands cold gets a *Tap for sound* button on the canvas, and everyone can mute it. Uploads are checked against the `media` bucket (100 MB; PNG/JPEG/WebP/GIF, MP4/WebM, MP3/M4A/OGG/WAV) before they start.

## Running it

Prerequisites: Node 22, pnpm 10, the Supabase CLI, a LiveKit Cloud project, an S3/R2 bucket with a public base URL, a Stripe account, a Resend account with a verified sending domain. Name each of them `cueline`.

On the hosted Supabase project, turn on **Allow anonymous sign-ins** (Authentication → Sign In / Providers) and leave captcha off; attendees get an anonymous identity client-side before they register, and `supabase/config.toml` only configures the local stack. If attendees see a "Could not start a session" message, it names the setting or limit that is in the way.

```bash
pnpm install
cp .env.example .env.local        # fill in the keys
supabase start && supabase db reset   # applies migrations + seed
pnpm dev                          # http://localhost:3000
```

1. Create the first host with `pnpm admin:create <email> <password> --super` (uses the service-role key from `.env.local`; it creates the user, adds them to the seeded org as owner, and with `--super` makes them a platform admin for the Stripe mode switch). Then sign in at `/login` with email and password.
2. Open `/host`. Use the seeded *Main room* or create a new one. In the room, create an event with a start time and copy its invite link; check the Emails tab (the welcome and the four reminders are already there); upload a PDF, add a few activities, edit the waiting room.
3. Open the invite link in a private window and register with a name and email. The welcome email arrives with a personal link and a code; try the link in another browser, or `/join` with the email and code. **Open waiting room** puts the session in `waiting`; registrants see the waiting room under their registered name. **Go live** starts the stream. **Join with camera** publishes your video.
4. Navigate the deck, activate activities, reveal results, promote hands.

`pnpm video:check` asks LiveKit which rooms are open, who is publishing, and the status and error of every egress, then fetches the playlist each one wrote from `RECORDING_PUBLIC_BASE_URL` and reports the status code, CORS header and content type. Run it after "Go live" when participants see no video.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:test` (needs local Postgres 16 binaries and a non-root user, no Docker; a smoke check that returns `f` fails the run).

The Stripe webhook endpoint is `/api/stripe/webhook` (`checkout.session.*`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`), one endpoint per Stripe mode, both pointing at the same URL. The email dispatcher cron is `/api/emails/dispatch` (daily via `vercel.json`, authorised with `CRON_SECRET`).

## Still to verify

- [ ] Vendor pricing before committing to LiveKit. The free Build plan is a hard cap (60 transcode minutes a month, 100 concurrent participants); real sessions need Ship ($50/month) and are billed on connection minutes, downstream bandwidth and transcode minutes.
- [ ] Real latency on the HLS fallback; `hls.js` exposes `latency`, Safari native HLS does not (falls back to 3 s).
- [ ] Rendering speed of large PDFs on participants' devices (pdf.js renders one page at a time at container width).
- [ ] `X-Frame-Options` on the first external CTA targets you plan to embed.
