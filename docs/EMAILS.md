# Event emails: the welcome and the anticipation sequence

25 Oct 2026 (first version 24 Oct 2026)

Every room carries an email sequence: a welcome sent on registration and reminders sent at fixed times before an event starts. Every event created in the room inherits the sequence, and the app turns it into scheduled emails at Resend, one per registrant per step, timed against that event's start and carrying that registrant's personal link. The host edits the sequence once per room; the change reaches every open event in it.

## What the attendee gets

| When | Email | Link inside |
| --- | --- | --- |
| On registration | "Welcome to {{title}}" with the personal link and the join code | `/a/<access_token>` |
| 48 h before | "{{title}} is in two days" | same |
| 24 h before | "Tomorrow: {{title}}" | same |
| 2 h before | "{{title}} starts in 2 hours" | same |
| 15 min before | "Starting in 15 minutes: {{title}}" | same |

The personal link `/a/<access_token>` binds the registration to whatever anonymous browser identity the attendee holds when they open it, then sends them into the room (or to the event page if the room is not open yet). No email, no code, works on any device. The fallback is `/join`: email plus the six-character code from the welcome, which does the same re-binding.

## Rooms, events and inheritance

A host runs any number of rooms (created on `/host`). Each room is a standing space with its own deck, activities, waiting room and email sequence. An event (an invite link with a title and a start time) runs in a room, and a room can hold several events over time.

- **The room owns the sequence.** `room_emails` holds the welcome and the reminders. A new room is seeded with the five defaults above by a trigger.
- **Events inherit it.** Creating an event copies the room's steps into `invite_emails`, each row linked back to the room step by `room_email_id`. Send times are computed per event: `starts_at − minutes_before`.
- **Room edits reach open events.** When the host edits, adds, toggles or deletes a room step, `sync_room_email()` inserts or updates the inherited row on every event that is not revoked, and the app reschedules those rows at Resend against each event's start. The welcome is never re-sent; edits to it apply to future registrations.
- **Different copy for different webinars** means a different room. There is no per-event override; the room is the unit of configuration.

## Where it lives

| Piece | Location |
| --- | --- |
| Sequence per room | `room_emails` (kind, minutes_before, subject, body, enabled). `rooms_seed_emails` trigger seeds the defaults; `default_room_emails()` holds the copy. |
| Sequence per event | `invite_emails`, same columns plus `room_email_id`. `invites_seed_emails` trigger copies from the room; `sync_room_email(step)` pushes a room edit to open events and returns the event steps touched. |
| What was asked of Resend | `registration_emails` (registration × event step, send_at, status `queued → scheduled/sent`, `resend_id`, error) |
| Codes and tokens | `registrations.code` (6 chars, unique per invite) and `registrations.access_token` (unique) |
| Timezone for the copy | `invites.timezone`, captured from the host's browser when the event is created or edited |
| Rendering | `apps/web/src/lib/email/template.ts`: `{{name}} {{first_name}} {{title}} {{starts_at}} {{link}} {{code}} {{join_url}} {{room}}` |
| Scheduling | `apps/web/src/lib/email/schedule.ts`: `queueRegistrationEmails`, `dispatch`, `resyncStep`, `resyncInvite`, `cancelStep`, `syncRoomStep`, `cancelRoomStep`, `cancelRoomEmails` |
| Resend client | `apps/web/src/lib/email/resend.ts`: plain fetch against `/emails`, `/emails/:id` (reschedule) and `/emails/:id/cancel` |
| Host UI | Emails tab in the host panel (`EmailSequence.tsx`): edit copy and timing, toggle, add, delete, preview; delivery counts (sent/scheduled/failed) for one event at a time |
| Rooms | `/api/rooms` (create, rename, change address, delete), `NewRoomForm.tsx` on `/host`, `RoomSettings.tsx` on the Settings tab |

## Flow

1. **Register** (`/api/register`). Upsert the registration, then `queueRegistrationEmails`: one `queued` row per enabled event step whose send time is still ahead (a reminder whose time has already passed is skipped, except within a ten-minute grace where it goes out at once). Then `dispatch` for that registration.
2. **Dispatch.** For each queued row due within Resend's scheduling horizon (30 days): send immediately if due within a minute, otherwise send with `scheduled_at`. Record the Resend id and the status. Failures are recorded on the row and shown to the host; they are not retried automatically.
3. **Host edits a room step** (`/api/emails/steps`). The room row is updated, `sync_room_email` pushes it to every open event, and for each inherited step the scheduled copies are cancelled at Resend, the rows dropped, and the step queued and dispatched again for every registrant. Disabling a step cancels and stops; deleting a step cancels on every event before the inherited rows cascade away.
4. **Host creates an event** (host panel, Event tab). The trigger copies the room sequence; nothing is scheduled until someone registers.
5. **Host changes the start time** (`/api/invites/update`). Every reminder step of that event is resynced as above.
6. **Host deletes a room** (`/api/rooms`). Every reminder still scheduled at Resend for the room's registrants is cancelled, then the room and everything under it cascades away. A room with an open session cannot be deleted.
7. **Cron** (`vercel.json`, daily, `GET /api/emails/dispatch` with `Authorization: Bearer $CRON_SECRET`). Catches reminders that were beyond the 30-day horizon when registration happened.

## Configuration

```
RESEND_API_KEY=re_...
RESEND_FROM="Your name <hello@your-verified-domain>"
CRON_SECRET=<long random string>
NEXT_PUBLIC_APP_URL=https://your-app      # used to build the links in the emails
```

The sending domain must be verified in Resend. Without `RESEND_API_KEY` registrations still work; no email is sent and rows stay `queued`.

## Migration note

Rooms that existed before room sequences get one from their newest open event's steps (so edits made per event survive), or the defaults when there is none. Existing event steps are linked to the matching room step by kind and offset; a per-event step with no match stays on the event, keeps sending, but is not shown in the room editor.

## Known limits and next steps

- Delivery status comes from what Resend accepted, not from a webhook. A `scheduled` row whose time has passed is assumed sent. Wiring Resend's `email.delivered` / `email.bounced` webhooks into `registration_emails.status` is the next step if hosts need bounce visibility.
- Emails are plain text turned into simple HTML. Branding (logo, colours from `rooms.branding`) is not applied yet.
- No org-level template to seed new rooms from; every new room starts from the built-in defaults.
