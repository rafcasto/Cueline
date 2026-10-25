# Competitor assessment: Univid (univid.io)

25 Oct 2026. Read: the home page, `/webinar-software/` (their "Features" page) and `/pricing/`. Their sixteen feature sub-pages were not read, so detail behind Polls, Q&A, Reactions, Lead scoring, Subtitles and Analytics is as the overview pages describe it. Quotes are theirs; everything about Tertulia is the Phase 1 code on this branch.

## Positioning

Univid sells to B2B marketing and sales teams: "Host webinars that convert", "Turn webinars into predictable pipeline", "Create engaging webinars in 60 seconds". The buyer is measured on leads, so the site leads with CRM sync (two-way HubSpot), registrant-based pricing and conversion claims ("increase conversion by up to 50%", "3% higher engagement results in 75% more revenue"). Enterprise logos (Visma, Sopra Steria, Capgemini Invent, Stockholm city), G2 badges, "70,000 users", "Built in Sweden", GDPR.

Tertulia's wedge (see DESIGN.md) is different: the engagement is *on the slide*. The presenter uploads a deck and launches polls, quizzes, word clouds and calls to action as overlays that attendees answer on the slide they are already watching, with a timer and a reveal. Univid's call to action is a button next to the stream; nothing on their overview pages describes quizzes, word clouds, timers, scoring, a waiting room or activities tied to the deck. That is the story the landing page should tell, and it should not borrow the pipeline framing that Tertulia cannot yet back with integrations and analytics.

## Feature inventory, side by side

Legend: **yes** in Phase 1; **partial** exists but thinner; **no** not built; **planned** in DESIGN.md.

### Create

| Univid | Tertulia |
| --- | --- |
| Custom branding: "Your colors. Your logo. Your look." Templates. | **yes** Accent colour, logo and a standing call to action per room, applied to the room and the invite page. No templates. |
| Create a call to action | **yes** Two kinds: the room's standing CTA button, and CTA activities launched as overlays with Stripe checkout, embed or new-tab destinations, view/tap/conversion logged. |
| Invite co-hosts and speakers via magic link | **partial** Org members sign in with a password; promote-to-stage brings an attendee on camera live. No speaker magic link. |
| Participant registration, via Univid or integration | **yes** Invite links per event, two-field registration, join code and personal link. No external registration source. |
| Webinar Spaces: a branded landing page listing live and on-demand webinars | **no** |
| AI-assisted branding and graphics | **no** |
| "Create webinars in 60 seconds" | **partial** A room with an event and invite link takes about that; the deck and activities take longer. |

### Market

| Univid | Tertulia |
| --- | --- |
| Email sendouts to invite participants | **no** No broadcast to a list; attendees come through the invite link. |
| Automatic branded reminders | **yes** Welcome on registration, reminders at 48 h, 24 h, 2 h and 15 min, edited per room and inherited by every event, rescheduled when the start moves. Not branded with the room's colour or logo yet. |
| Customisable follow-up emails | **no** The sequence stops at the start of the event. |
| AI graphics for social and web | **no** |

### Host

| Univid | Tertulia |
| --- | --- |
| Browser-based for hosts and attendees, no download | **yes** |
| Virtual studio, up to 10 simultaneous speakers | **partial** Presenters publish over WebRTC; promoted attendees join them. No studio layout controls, no cap tested beyond a few publishers. |
| Upload slides: PDF, mp4 | **partial** PDF only. |
| Automatic recording in 1080p | **yes** One room-composite egress per session writes the recording and the HLS fallback. Resolution follows the egress preset. |
| Simulated live (pre-recorded played as live) | **no** |
| RTMP ingestion, restreaming to YouTube and LinkedIn | **no** |
| Breakout rooms | **no** |
| Participant support chat | **no** |
| Waiting room | Not mentioned by Univid | **yes** Picture or looping video, music, text on a 16:9 canvas, tap-for-sound. |

### Engagement

| Univid | Tertulia |
| --- | --- |
| Polls | **yes** As an overlay on the slide, with an optional timer and a results reveal. |
| Quizzes | Not mentioned | **yes** Correct answers, points, server-side scoring, leaderboard across the session. |
| Word clouds | Not mentioned | **yes** |
| Q&A | **yes** Upvotes, host moderation, mark as answered. |
| Chat | **yes** Live chat beside Q&A, in the waiting room and the session; the host hides messages and can switch chat off per room. |
| Reactions | **yes** Six kinds, batched per second, float for everyone. |
| Hand raise and bring on stage | Not mentioned | **yes** |
| Call to action button that opens a website | **yes** Plus checkout and embed; see Create. |
| Lead scoring | **no** |
| Subtitles | **no** |
| Multilingual ("localize in one click") | **no** English only. |

### Analyse and integrate

| Univid | Tertulia |
| --- | --- |
| Insights and leads fed to the CRM; HubSpot two-way sync; Zapier, Make; Salesforce, Upsales, Lyyti, LinkedIn on Custom; API | **no** Registrations, responses, CTA events and quiz scores are in the database and views, with no export or integration. |
| Analytics | **partial** The host panel shows registered against joined, answered counts, tallies and the leaderboard live. No post-event report. **planned** Phase 3. |
| Recommendations for future webinars | **no** |
| On-demand: download, embed or link to the recording | **partial** The recording URL is stored on the session; nothing attendee-facing yet. |

### Admin, security, support

| Univid | Tertulia |
| --- | --- |
| GDPR compliance badge | **no** statement yet. Data is in Supabase and Resend; a privacy page is needed before public signup. |
| SAML SSO | **no** |
| Unlimited team members | **partial** Org members with owner/host/presenter roles, added by script. No self-serve invite. **planned** Phase 2. |
| Pricing by unique monthly registrant; Free (20 registrants, 10 live, 20 min), Growth from €99 (100 registrants, 100 live, 4 h), Custom | **planned** Phase 3: Free 20 attendees, Starter ~$29, Pro ~$79, flat tiers with an attendee-hour pool. No billing or signup yet. |

## What this means for the product

Where Tertulia is already ahead: activities that live on the slide with timers, reveal and scoring; quizzes and word clouds; the waiting room; promote-to-stage; checkout inside the room; per-room branding and email sequences. These are the differentiators to show first.

Where Univid is ahead and it matters to the same buyer, in rough order of weight:

1. Integrations and lead export. Even a CSV of registrations with answers and CTA taps would close most of the gap for a small team; HubSpot and Zapier are the names to match.
2. Post-event analytics and a follow-up email with the recording. The follow-up step fits the existing sequence model (a step with `minutes_after`).
3. On-demand playback of the recording on the invite page after the event.
4. Branded emails (the room's logo and accent in the templates).
5. Self-serve signup and team invites (Phase 2), then a public pricing page (Phase 3).
6. mp4 slides, subtitles, multilingual, SSO: real but later.

## Their landing page, and ours

Univid home page, in order: nav (Features, Pricing, Resources, Log in, Book demo, Try for free); hero with a one-line promise, one CTA, G2 badges and a logo strip; a branding section with a screenshot; a testimonial with a survey stat; an engagement section with a tag row (Call to action, Chat, Q&A, Polls, Reactions, Lead scoring, More) and an animated demo of one feature; an integrations section with a UI mock; a four-step "the Univid way" (Create, Market, Host, Analyze); a closing CTA ("Get started today"); a footer with Company, Product and Resources link groups and a GDPR badge. No pricing teaser, FAQ or video on the home page. Tone: short, upbeat, imperative, light emoji.

The new Tertulia landing page follows the same skeleton with what exists: nav with anchors; hero with the promise and both doors (host sign in, attendee join); an engagement section with a tag row of the real activity kinds and a built-in mock of a poll over a slide; a branding section with a live mock in a custom colour; a four-step "the Tertulia way" (Create, Invite, Host, Reveal) listing only shipped features; a closing CTA; a footer with Product and Attendee groups. It carries no testimonials, logos, ratings or percentages, because there are none yet; those sections should be added only when they are true.
