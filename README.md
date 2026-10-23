# Cueline

Webinars with the engagement built in. The presenter uploads a deck as a PDF, presents it in the room, and launches polls, quizzes, word clouds and calls to action as overlays for everyone watching. Each activity can carry a timer; when it runs out the presenter reveals the results as an overlay. Participants react at any time and see a waiting room before the session starts.

The full design is in [docs/DESIGN.md](docs/DESIGN.md). This repo is the Phase 1 build: one room, presenters on WebRTC, viewers on HLS, PDF deck, activities, Q&A, reactions, waiting room, recording. No tiers, billing or signup yet.

## Layout

| Path | What |
| --- | --- |
| `supabase/migrations` | Schema. Every table carries `org_id`; session tables carry `session_id`. RLS, the `session:{id}` broadcast trigger, timer and quiz-scoring triggers, `run_tallies` and `quiz_scores` views, storage buckets. |
| `supabase/tests` | Stubs + smoke test that exercise the migration against plain Postgres (`pnpm db:test`). |
| `apps/web` | Next.js on Vercel: invite link and registration (`/join/[token]`), participant room (`/r/[slug]`), host panel (`/host/[slug]`), and the functions that need the service key (`/api/*`). |

## How it fits together

**Invite link and registration.** The organiser creates an invite link in the host panel (title, optional start time and blurb). Attendees open `/join/<token>`, register with a name and email, and the same page becomes the door on the day: its button follows the session state. `/r/<slug>` sends anyone without a registration to the room's current link; org members walk in. Registrations bind to the attendee's anonymous identity, and registering the same email again re-binds it, so a second device works. The host panel shows *registered* against *joined*. The reasoning and what to measure are in [docs/INVITE-FLOW.md](docs/INVITE-FLOW.md).

**Video room.** LiveKit Cloud behind `apps/web/src/lib/video.ts`. Participants play an HLS playlist produced by room-composite egress and never open a WebRTC socket. Presenters and promoted participants get publish tokens. Promote-to-stage is `stage_roster` state (`viewer → invited → live → revoked`).

**Deck.** A PDF in the `presentations` storage bucket. The presenter steps through it (arrow keys or buttons); each navigation inserts a `slide_events` row and every participant renders that page from the same PDF with pdf.js. The presenter video sits in a corner of the slide.

**Activities.** The presenter authors polls, quizzes (with correct answers and points), word clouds and CTAs in the host panel, each with an optional timer. Activating one inserts an `activity_run`; a trigger sets `closes_at` from the timer. Participants answer in an overlay; the database rejects answers after the timer or after the presenter closes the run, and scores quizzes server-side. "Show results to participants" flips `results_shown_at` and the overlay switches to tallies, the word cloud, or the quiz leaderboard. "Dismiss overlay" hides it.

**Realtime.** One broadcast channel per session. Clients never subscribe to `postgres_changes`; a trigger calls `realtime.broadcast_changes` on every write and the client applies a reducer (`apps/web/src/lib/session-state.ts`). HLS participants delay slide changes and activity openings by the player's measured live-edge latency so they land with the video.

**Reactions.** Like, heart, laugh, sad, wow, clap. Taps batch client-side and land as one row per second per kind through `bump_reaction()`; everyone sees them float.

**Waiting room.** Per room: an image, a video, or an image plus audio, with text boxes positioned on a 16:9 canvas in a small slide-like editor. Shown while the session is `waiting` and when the room is closed.

## Running it

Prerequisites: Node 22, pnpm 10, the Supabase CLI, a LiveKit Cloud project, an S3/R2 bucket with a public base URL, a Stripe account. Name each of them `cueline`.

```bash
pnpm install
cp .env.example .env.local        # fill in the keys
supabase start && supabase db reset   # applies migrations + seed
pnpm dev                          # http://localhost:3000
```

1. Create the first host with `pnpm admin:create <email> <password>` (uses the service-role key from `.env.local`; it creates the user and adds them to the seeded org as owner). Then sign in at `/login` with email and password.
2. Open `/host/main`. Create an invite link and copy it; upload a PDF, add a few activities, edit the waiting room.
3. Open the invite link in a private window and register with a name and email. **Open waiting room** puts the session in `waiting`; registrants see the waiting room under their registered name. **Go live** starts the stream. **Join with camera** publishes your video.
4. Navigate the deck, activate activities, reveal results, promote hands.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:test` (needs local Postgres 16 binaries and a non-root user, no Docker; a smoke check that returns `f` fails the run).

The Stripe webhook endpoint is `/api/stripe/webhook` (`checkout.session.*` events).

## Still to verify

- [ ] Vendor pricing (participant-minute, HLS egress, recording storage) before committing to LiveKit.
- [ ] Real HLS latency on the chosen vendor; `hls.js` exposes `latency`, Safari native HLS does not (falls back to 3 s).
- [ ] Rendering speed of large PDFs on participants' devices (pdf.js renders one page at a time at container width).
- [ ] `X-Frame-Options` on the first external CTA targets you plan to embed.
