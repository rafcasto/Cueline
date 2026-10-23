# Invite link and registration

23 Oct 2026 · Lean UX pass on the attendee entry

The open door at `/r/<slug>` (type a name, you are in) is replaced by an invite link the organiser creates. Attendees register with a name and email on that link and enter the room from it. This note records the assumptions behind that change and the smallest build that tests them, so the next iteration is driven by what attendees and organisers do, not by what we think they want.

## Assumptions, by risk

| # | Assumption | Risk if wrong | Uncertainty | Test first? |
| --- | --- | --- | --- | --- |
| A1 | Organisers want attendee emails before the webinar, and will accept fewer walk-ins to get them | High: the gate costs attendance | Medium | **Yes** |
| A2 | Attendees will give a name and email for a free webinar when the page shows what it is and when | High: zero registrations means zero attendance | Medium | **Yes** |
| A3 | One link that is both the registration page and the door on the day is less confusing than two links (register here, join there) | Medium | High | **Yes** |
| A4 | An anonymous browser identity is enough to recognise a registrant on return; no password, no magic link | Medium: a second device needs re-registration with the same email | Low (handled: re-registering re-binds the email) | No |
| A5 | Organisers need a live registrant list more than they need email confirmations | Low | Medium | No, later |
| A6 | Organisers run several events per room and want a fresh link per event rather than one permanent link | Low | High | No, observe |

## Hypotheses

**H1 (organiser).** We believe organisers will create an invite link for every webinar they run if the link is the first thing the host panel shows them when the room has none. Signal: share of sessions that go live with at least one active invite. Validated at ≥ 80% over the first ten sessions.

**H2 (attendee).** We believe at least 60% of people who open an invite link will register when the page shows the title, the start time and two fields only. Signal: `registrations` ÷ unique opens of `/join/<token>`. Invalidated below 40%, at which point the email field moves after the room (register with name, ask for email inside).

**H3 (door).** We believe at least 70% of registrants will join the session when the same link turns into "Join now" once the host goes live. Signal: registrants whose `user_id` appears in `participants` for the open session, shown in the host panel as *registered* against *joined*. Invalidated below 50%, at which point a reminder email (A5) becomes the next experiment.

## The MVP that tests them

Smallest thing that puts a real link in front of real attendees:

- **Organiser:** one card in the host panel. Create link (title, optional start time, optional blurb), copy it, see *registered* and *joined* counts, see the list, revoke. The host panel opens on this card while the room has no link (H1).
- **Attendee:** one page at `/join/<token>`. Waiting-room art, title, time, name and email, Register. After registering the same page is the door, and its button follows the session state: not open, doors open, live (H2, H3).
- **Room:** `/r/<slug>` sends anyone without a registration to the room's current link. Org members walk in so hosts can check their own room.

Deliberately left out until a hypothesis asks for it: confirmation and reminder emails, calendar files, custom registration questions, capacity limits, approval queues, duplicate-device detection. Each is a separate experiment with its own signal.

## What to measure, where it lives

| Signal | Source |
| --- | --- |
| Opens of a link | Vercel request logs for `/join/<token>` (no table yet; add a `link_opens` count only if H2 needs the denominator) |
| Registrations per link | `registrations` by `invite_id` |
| Registrants who joined | `participants.user_id ∩ registrations.user_id` per session; the host panel shows both numbers |
| Time from registration to join | `participants.joined_at − registrations.created_at` |
| Links created per session | `invites` by `room_id` against `sessions` |

## Research cadence

Watch three real webinars end to end, sitting with the organiser during setup and the first five minutes of the session. Ask attendees who registered but did not join one question by email: what stopped you. Review the numbers above after each webinar and decide: keep, change the form, or drop the gate.

## Score against Lean UX

**Before this pass: 3/10.** No declared assumptions, the entry flow was built from the design doc without a hypothesis, nothing measured who got in or dropped off.

**Now: 7/10.** Assumptions ranked, three hypotheses with pre-committed thresholds, an MVP sized to test them, and the two outcome numbers on the organiser's screen. To reach 10: run the three-webinar observation before adding anything else, log link opens so H2 has a true denominator, and bring a second organiser into the next sketching session so the card is not designed for one host.
