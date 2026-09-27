# Cueline

Webinars where the slides drive the engagement. A presenter types a cue into a Google Slides speaker note; when that slide comes up, the poll or call-to-action pops for every viewer, with results drawn over the slide they are already watching.

```
#poll: Which channel brings you the most leads? | Email | LinkedIn | Referrals | Paid
#multipoll: Which tools do you use? | Slack | Notion | Linear
#text: What is your biggest blocker right now?
#cta: Join the waitlist | embed | https://cueline.app/waitlist
#cta: Buy the course | stripe | price_1Abc...
```

The full design is in [docs/DESIGN.md](docs/DESIGN.md). This repo is the Phase 1 build: one room, presenters on WebRTC, viewers on HLS, chat-free Q&A, polls via the extension, recording. No tiers, billing or signup yet.

## Layout

| Path | What |
| --- | --- |
| `supabase/migrations` | Schema. Every table carries `org_id`; session tables carry `session_id`. RLS, the `session:{id}` broadcast trigger, `poll_tallies` view. |
| `supabase/tests` | Stubs + smoke test that exercise the migration against plain Postgres (`pnpm db:test`). |
| `packages/cues` | The cue parser shared by deck sync and the extension. |
| `apps/web` | Next.js on Vercel: viewer room (`/r/[slug]`), host panel (`/host/[slug]`), and the functions that need the service key (`/api/*`). |
| `apps/extension` | Chrome extension (MV3): reports the presented slide, draws results over it. |

## Components

**Video room.** LiveKit Cloud behind `apps/web/src/lib/video.ts`. Viewers play an HLS playlist produced by room-composite egress and never open a WebRTC socket. Presenters and promoted viewers get publish tokens. Promote-to-stage is `stage_roster` state (`viewer → invited → live → revoked`); the viewer pre-warms on `invited`, publishes on `live`, and Supabase stays the source of truth if the vendor call fails.

**Engagement layer.** Supabase tables + one broadcast channel per session. Clients never subscribe to `postgres_changes`; a trigger calls `realtime.broadcast_changes` on every write and the client applies a reducer (`apps/web/src/lib/session-state.ts`). Viewers are anonymous-auth users with insert-only rights. HLS viewers delay each slide event by the player's measured live-edge latency (`apps/web/src/lib/latency.ts`) so the poll lands with the slide.

**Slides.** The extension polls `location.href` in present mode for `slide=id.xxx`, debounces, dedupes, and POSTs to `/api/slide-event`. The function resolves the live session for that deck, looks up the slide's cue in `deck_slides`, inserts `slide_events`, and the trigger does the rest. Deck sync (`/api/deck/sync`) reads speaker notes through the Slides REST API with the host's Google token; there is no Apps Script add-on.

## Running it

Prerequisites: Node 22, pnpm 10, the Supabase CLI, a LiveKit Cloud project, an S3/R2 bucket with a public base URL, a Google OAuth client, a Stripe account. Name each of them `cueline`.

```bash
pnpm install
cp .env.example .env.local        # fill in the keys
supabase start && supabase db reset   # applies migrations + seed
pnpm dev                          # http://localhost:3000
```

1. Sign in at `/login` with Google. Add yourself to the seeded org (the host page prints the SQL with your user id).
2. Build the extension (`pnpm --filter extension build`), load `apps/extension/dist` unpacked at `chrome://extensions`, put its id in `NEXT_PUBLIC_EXTENSION_ID`, restart `pnpm dev`.
3. Open `/host/main`, click **Connect extension**, paste your deck URL, **Sync cues**, then **Go live** and **Join as presenter**.
4. Present the deck in Chrome. Viewers join at `/r/main`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:test` (needs local Postgres 16 binaries, no Docker).

Google OAuth needs the scope `https://www.googleapis.com/auth/presentations.readonly`; enable Google in the Supabase auth settings and set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` for `supabase start`. The Stripe webhook endpoint is `/api/stripe/webhook` (`checkout.session.*` events).

## Still to verify (from the design's prototype checklist)

- [ ] Present mode updates `slide=` in `location.href` on advance, in both the audience and presenter-view windows. The content script has a DOM fallback but it is untested.
- [ ] A content-script overlay above the slide canvas shows up in a screen share.
- [ ] Vendor pricing (participant-minute, HLS egress, recording storage) before committing to LiveKit.
- [ ] Real HLS latency on the chosen vendor; `hls.js` exposes `latency`, Safari native HLS does not (falls back to 3 s).
- [ ] `X-Frame-Options` on the first external CTA targets you plan to embed.
