# Tertulia — Brand Guidelines

20 Nov 2026 · from the product roadmap

Tertulia should feel like a lively café conversation at night: warm, human and sharp. It moves away from the earlier blue corporate look while staying credible for paying hosts. The tokens live in `apps/web/src/app/globals.css`; the fonts are loaded in `apps/web/src/app/layout.tsx`.

## Colour palette

| Role | Name | Hex | Token | Use |
| --- | --- | --- | --- | --- |
| Base dark | Espresso | `#2B1D19` | `--ink`, `--espresso` | Body text, header, footer. Near-black for a sharp, modern feel |
| Background | Cream | `#FFF8EE` | `--surface`, `--surface-sunken` | Page backgrounds |
| Surface | Warm white | `#FFFFFF` | `--surface-raised` | Cards, modals, room tiles |
| Brand | Terracotta | `#D9643A` | `--accent` | Logo, large headings, illustrations, highlights. Never small text |
| Action | Teal | `#17706F` | `--brand` | Buttons and links only ("Join a room", "Host an event"). White text on top |
| Action hover | Deep teal | `#0F5655` | `--brand-hover` | Hover and pressed states |
| Neutral 700 | Warm grey | `#5C5350` | `--ink-muted` | Secondary text, captions |
| Neutral 300 | Light grey | `#D9D2CC` | `--line` | Borders, dividers |
| Neutral 100 | Mist | `#F2ECE5` | `--surface-inset` | Subtle fills, input backgrounds |
| Success | Green | `#2E7D4F` | `--success` | Confirmations, "You're registered" |
| Warning | Amber | `#C98A12` | `--warning` | Few spots left, reminders |
| Error | Red | `#B3261E` | `--error` | Errors, failed actions |
| Live | Coral | `#E8473B` | `--live` | "LIVE now" badges only |

Each status colour has a `-soft` tint for badge and alert backgrounds and an `-ink` shade dark enough for small text on it (amber in particular fails AA as small text, so `--warning-ink` is what text uses).

### Colour rules

- One brand colour (terracotta) and one action colour (teal). Teal always means "click"; never use it for decoration.
- Terracotta is for large elements only (24 px or bigger, or shapes); it fails contrast as small text on cream. `--accent-ink` is the darkened shade for the rare small label on `--accent-soft`.
- All body text meets WCAG AA contrast (4.5:1); espresso on cream and white on teal both pass.
- Keep brown to the near-black espresso; avoid mid-browns so it doesn't read as a café menu.
- A room's own accent overrides the `--brand*` variables inside the room (`lib/branding`), so a host's colour takes over the buttons there; the product's teal and terracotta stay on the public pages.

### Live reaction colours

Heart `#E8473B` · Happy `#F2B233` · Angry `#B3261E` · Clap or fire `#D9643A` · Thinking `#17706F`. Reactions float briefly over the presenter; hosts see them aggregated in the insights dashboard.

## Typography

- Headings: Fraunces (warm, friendly serif), weight 600. Applied to `h1`–`h3` globally and available as `font-heading`.
- Body and interface: Inter, weights 400 and 600.
- Scale: H1 48 px · H2 32 px · H3 24 px · body 16 px · small 14 px; line height 1.5 for body.
- Sentence case for headings and buttons.
- A card title that should read as interface rather than as a heading uses `font-sans` to opt out of Fraunces.

## Interface style

- Rounded corners: 12 px cards, 8 px buttons.
- Soft shadows, generous white space, a cream background with white cards. Cards carry a shadow rather than a border.
- Imagery: real people in warm light, candid conversation moments; no stock handshake photos. Until there are photographs, the illustrations are flat shapes in the palette (the hero art on `/` and `/for-hosts`).
- Icons: simple rounded line icons.

## Voice and tone

- Warm, curious and direct, like a good host at a café table.
- Say "rooms", "hosts", "events" and "join", never "communities" or "webinars".
- Taglines: "Join live conversations that matter" (attendees) · "Know who's ready to buy before your event ends" (hosts).

## Logo

- Wordmark "Tertulia" in Fraunces, terracotta by default; espresso or cream where the ground calls for it (`Logo` in `components/ui`).
- Symbol: a speech bubble merged with a coffee cup (`LogoMark`; `app/icon.svg` for the favicon).
- Versions: full colour on cream (header), cream on espresso (footer), single-colour icon on terracotta (favicon).

## Website

Two landing pages. The home page (`/`) serves attendees, since most visitors arrive from event links: hero with topic search, happening soon, browse by topic, featured rooms, how it works, an espresso band for hosts, the footer. The "Host an event" button leads to `/for-hosts`, which does the selling: hook, three pains, how it works, features, demo video and testimonials (hidden until real ones exist), pricing with the founding-host card, FAQ, final call to action.

Breakpoints: mobile under 640 px (single column; event cards scroll horizontally), tablet 640–1024 px (two columns), desktop above 1024 px. Max content width 1152 px, centred.
