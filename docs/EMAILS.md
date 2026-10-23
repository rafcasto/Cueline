# Event emails: confirmation and the anticipation sequence

24 Oct 2026

Every registration triggers a confirmation email, and every event carries a sequence of reminder emails sent at fixed times before it starts. The host edits the sequence per event; the app turns it into scheduled emails at Resend, one per registrant per step, each carrying that registrant's personal link.

## What the attendee gets

| When | Email | Link inside |
| --- | --- | --- |
| On registration | "You're in: {{title}}" with the personal link and the join code | `/a/<access_token>` |
| 48 h before | "{{title}} is in two days" | same |
| 24 h before | "Tomorrow: {{title}}" | same |
| 2 h before | "{{title}} starts in 2 hours" | same |
| 15 min before | "Starting in 15 minutes: {{title}}" | same |

The personal link `/a/<access_token>` binds the registration to whatever anonymous browser identity the attendee holds when they open it, then sends them into the room (or to the event page if the room is not open yet). No email, no code, works on any device. The fallback is `/join`: email plus the six-character code from the confirmation, which does the same re-binding.

## Where it lives

| Piece | Location |
| --- | --- |
| Sequence per event | `invite_emails` (kind, minutes_before, subject, body, enabled). A trigger on `invites` seeds the five defaults. |
| What was asked of Resend | `registration_emails` (registration × step, send_at, status `queued → scheduled/sent`, `resend_id`, error) |
| Codes and tokens | `registrations.code` (6 chars, unique per invite) and `registrations.access_token` (unique) |
| Timezone for the copy | `invites.timezone`, captured from the host's browser when the event is created or edited |
| Rendering | `apps/web/src/lib/email/template.ts`: `{{name}} {{first_name}} {{title}} {{starts_at}} {{link}} {{code}} {{join_url}} {{room}}` |
| Scheduling | `apps/web/src/lib/email/schedule.ts`: `queueRegistrationEmails`, `dispatch`, `resyncStep`, `resyncInvite`, `cancelStep` |
| Resend client | `apps/web/src/lib/email/resend.ts`: plain fetch against `/emails`, `/emails/:id` (reschedule) and `/emails/:id/cancel` |
| Host UI | Emails tab in the host panel (`EmailSequence.tsx`): edit copy and timing, toggle, add, delete, preview, per-step sent/scheduled/failed counts |

## Flow

1. **Register** (`/api/register`). Upsert the registration, then `queueRegistrationEmails`: one `queued` row per enabled step whose send time is still ahead (a reminder whose time has already passed is skipped, except within a ten-minute grace where it goes out at once). Then `dispatch` for that registration.
2. **Dispatch.** For each queued row due within Resend's scheduling horizon (30 days): send immediately if due within a minute, otherwise send with `scheduled_at`. Record the Resend id and the status. Failures are recorded on the row and shown to the host; they are not retried automatically.
3. **Host edits a step** (`/api/emails/steps`). Scheduled copies are cancelled at Resend, the rows dropped, and the step is queued and dispatched again for every registrant. Disabling a step cancels and stops; deleting a step cancels before the rows cascade away. The confirmation is never re-sent; edits to it affect future registrations only.
4. **Host changes the start time** (`/api/invites/update`). Every reminder step is resynced as above.
5. **Cron** (`vercel.json`, daily, `GET /api/emails/dispatch` with `Authorization: Bearer $CRON_SECRET`). Catches reminders that were beyond the 30-day horizon when registration happened.

## Configuration

```
RESEND_API_KEY=re_...
RESEND_FROM="Your name <hello@your-verified-domain>"
CRON_SECRET=<long random string>
NEXT_PUBLIC_APP_URL=https://your-app      # used to build the links in the emails
```

The sending domain must be verified in Resend. Without `RESEND_API_KEY` registrations still work; no email is sent and rows stay `queued`.

## Known limits and next steps

- Delivery status comes from what Resend accepted, not from a webhook. A `scheduled` row whose time has passed is assumed sent. Wiring Resend's `email.delivered` / `email.bounced` webhooks into `registration_emails.status` is the next step if hosts need bounce visibility.
- Emails are plain text turned into simple HTML. Branding (logo, colours from `rooms.branding`) is not applied yet.
- One sequence per event. There is no org-level template to copy from yet; the defaults are the seed in the migration.
