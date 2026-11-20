# Tertulia — image briefs for Canva

20 Nov 2026 · what the product actually shows, turned into prompts

Two kinds of image are needed on the site: **photographs** (the hero, the cover pictures, the host band) and **product pictures** (the room, a poll over the slide, the insights). Photographs can be generated in Canva (Magic Media / Dream Lab) or shot at a real Job Hackers Global session. Product pictures should be *screenshots of the real app* re-framed in Canva — a generated "dashboard" always invents controls the product does not have. Where a generated product picture is unavoidable (the hero of `/for-hosts` before the insights screen exists), the prompt below lists exactly which elements the app has, so nothing else appears.

## The master instruction for Claude

Paste this first, then ask for whichever brief you need. It is the ground truth from the code, so Claude cannot drift into generic webinar imagery.

```
You are writing image-generation prompts for Tertulia (tertulia.cloud), a browser platform for live
online events. Everything below is what the product really does; never add features that are not here.

WHAT ATTENDEES SEE (the "room"):
- A slide (one page of the host's uploaded PDF deck) fills the stage. The host's camera sits on it in
  one of four layouts: bottom-right corner (default), full-stage talking head, side by side with the
  slide, or a custom position. The camera is a rounded 16:9 rectangle or a circle.
- Six reactions: 👍 ❤️ 😂 😢 😮 👏. Tapped ones float up over the stage for a couple of seconds.
- A "Raise hand ✋" button. The host can bring a raised hand on stage, camera and all.
- A side panel with two tabs, Chat and Q&A. Questions can be upvoted; the host marks them answered.
- Activities open as an overlay over the slide: a poll, a quiz (with scores and a leaderboard), a word
  cloud, or a call to action (a button that opens a link, or Stripe checkout). A timer bar runs down;
  the result (bars, cloud, leaderboard) appears when the host reveals it.
- Before the session: a waiting room with the host's backdrop picture or video, music, and text.
- A coral "LIVE now" badge marks a running session.

HOW PEOPLE GET IN:
- No account. Register for an event with a name and an email. A welcome email brings a personal link
  and a six-character join code (e.g. K7PQ2M). Events have seats and a waiting list; "3 spots left"
  turns amber.
- Rooms are discovered on Explore: event cards (topic, title, host, date, spots left, Join), room cards
  (cover picture, name, members, Public, Join room), and topic tiles (careers, AI, business…).

WHAT HOSTS SEE (the host panel):
- Tabs: Live, Event, Emails, Recordings, Waiting room, Settings. A badge reads Room closed, Doors open
  or Live.
- Live tab: their own camera, the deck with page controls, the activity library, run controls with a
  timer and a "Reveal" button, a "Hands up" list, chat and Q&A moderation.
- Event tab: the registration table with Name, Email, Event, Seat, Code, Registered, In room — who
  registered against who actually turned up — plus every poll, quiz and word-cloud answer and every
  call-to-action tap, each tied to a person.
- Settings: accent colour, logo, cover picture, call to action, topics, listing on Explore.

BRAND (always):
- Palette: cream #FFF8EE page, white cards, espresso #2B1D19 text, terracotta #D9643A for large shapes
  and the wordmark, teal #17706F for buttons only, coral #E8473B only for LIVE.
- Type: Fraunces (serif) headings, Inter body. Rounded 12 px cards, soft shadows.
- Mood: a lively café conversation at night — warm, human, sharp. Real people in warm light, candid
  conversation moments. Never stock handshakes, never headsets, never a generic "webinar" grid of faces,
  never blue corporate UI.
- Vocabulary: rooms, hosts, events, sessions, join. Never communities or webinars.

OUTPUT: for each image I ask for, give (1) a one-line purpose, (2) the Canva prompt in under 80 words
with subject, setting, light, framing and palette, (3) a negative list, (4) size and aspect ratio.
```

## The briefs

### 1. Home hero — "Join live conversations that matter"
Purpose: the first picture an attendee sees; conversation, not a broadcast.
Prompt: *Candid photo, three people at a small café table at night, laptop open between them showing a slide with a small round camera tile in its corner, warm tungsten light, terracotta wall, cream ceramic cups, one person mid-laugh, another leaning in, shallow depth of field, documentary style, no text.*
Negative: headsets, grid of video faces, office, blue light, logos, text.
Size: 1200×900 (4:3) for the right column; also export 1600×700 for a full-bleed variant.

### 2. Host band — "Run live sessions? Open your own room."
Prompt: *Over-the-shoulder photo of a coach at a kitchen table at night presenting to a laptop, her slide visible with a poll overlay (four answer bars, one teal), warm lamp light, dark espresso background, relaxed, confident, no text.*
Negative: ring light glare, corporate backdrop, microphone arm, stock smile.
Size: 1600×600 (8:3), dark edges so cream text sits on it.

### 3. Explore cover pictures (one per seeded room)
Job Hackers Global: *Warm candid photo of a diverse group of job seekers in a bright community hall, someone at a whiteboard listing "LinkedIn · CV · Interview", others taking notes, morning light, friendly, no faces too close, no text.*
Subir's AI video room: *Creator's desk at night, two monitors showing a video timeline and a generated clip, warm desk lamp, terracotta accents, hands on keyboard, cinematic, no logos.*
Size: 1200×400 (3:1); the card crops it to a 144 px band and the room page to a 256 px banner.

### 4. Topic tiles (optional, only if you want imagery instead of line icons)
Prompt per tile: *Minimal flat illustration, single terracotta #D9643A shape on cream #FFF8EE, [a briefcase / a circuit speech bubble / a pie chart / a paintbrush], rounded, no gradients, no outline, centred, 1:1.*
Size: 256×256.

### 5. `/for-hosts` hero — the insights screen
Use a real screenshot of the Event tab once the insights view exists. Until then, the drawn version in the code is the fallback. If you generate one, constrain it:
Prompt: *Clean product screenshot, cream background, one white rounded card titled "Showed up 23 of 31", a list of five first names each with a horizontal teal engagement bar, two rows marked with a small coral heart, a green pill "2 ready to buy", Inter font, no other widgets, no charts, no sidebar.*
Negative: pie charts, maps, KPI grids, blue, dark mode, extra menus.
Size: 1200×900.

### 6. "A poll over the slide" (features section / social)
Screenshot the real room with a poll open, or:
Prompt: *Browser window on cream background. A slide with a Fraunces headline, a translucent espresso overlay panel over it with a question, four answer rows (the chosen one teal), a thin timer bar, a round camera tile bottom-right with a presenter in warm light, six small emoji 👍 ❤️ 😂 😢 😮 👏 along the bottom, a side panel with tabs "Chat" and "Q&A". No other UI.*
Size: 1600×1000.

### 7. "Raise a hand, come on stage" (social / how-it-works)
Prompt: *Split image: left, a phone screen with a big teal button "✋ Raise hand" under a slide; right, the same person now in a round camera tile beside the host on the slide, warm light, cream page, no other text.*
Size: 1200×800.

### 8. Email / welcome visual
Prompt: *Flat illustration on cream: an open envelope in terracotta, a card sliding out with a six-character code "K7PQ2M" in a monospace font and a teal "Open your link" button, soft shadow, no people.*
Size: 1200×600.

## Rules of thumb when reviewing Canva's output

- If it shows a 3×3 grid of faces, it is Zoom, not Tertulia. Reject.
- If the slide has no camera tile on it, it is a slideshow, not a live session. Reject.
- Buttons teal, LIVE coral, big shapes terracotta — any blue means it drifted. Reject.
- Faces should be at a table, in a kitchen, in a hall — somewhere real, at night or in warm light.
- The product pictures must only contain elements in the master instruction. Anything else is a feature we would have to build.
