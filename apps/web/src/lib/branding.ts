/**
 * Room branding: the accent colour, the logo and the cover picture a host gives a room, stored in
 * `rooms.branding` (jsonb). Pure functions shared by the host editor, the
 * API that validates a save, and the attendee pages that apply it, so they are unit-tested
 * without a browser.
 *
 * The accent reaches the screen as CSS variables: every `bg-brand`, `text-brand-ink`,
 * `bg-brand-soft` utility reads `--brand*`, so overriding those on a wrapper restyles the
 * whole subtree (buttons, badges, selected options, result bars) without a second theme.
 */

export type RoomBranding = {
  /** Accent colour as #rrggbb. Absent means the product default. */
  accent?: string;
  /** Public URL of the logo (media bucket) shown in place of the product mark. */
  logo_url?: string;
  /** Leave the room's name out of headers where the logo already says it. Only kept while there is a logo. */
  hide_name?: boolean;
  /** The cover picture: one of DEFAULT_COVERS (a site path) or the public URL of an upload (media bucket). The band across the room's card and the top of its page. */
  cover_url?: string;
};

/**
 * The pictures a room can wear without uploading anything: people around a table in warm
 * light, the imagery docs/BRAND.md asks for. Served from `public/covers`, so a value is a site
 * path rather than a bucket link, and the same four files sit behind every room that uses them.
 */
export const DEFAULT_COVERS: { url: string; label: string }[] = [
  { url: "/covers/cafe-laptop.webp", label: "Three friends around a laptop in a café" },
  { url: "/covers/cafe-sketch.webp", label: "Three people over a sketch at a café table" },
  { url: "/covers/cafe-portraits.webp", label: "A drawing group sharing portraits" },
  { url: "/covers/library-reading.webp", label: "A reading group in a library" },
];

export function isDefaultCover(url: string): boolean {
  return DEFAULT_COVERS.some((c) => c.url === url);
}

/**
 * The default picture for a room that has none (rooms made before covers were set at creation,
 * or a row whose upload was dropped): the same one every time for the same room, so a card does
 * not change between visits.
 */
export function defaultCoverFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return DEFAULT_COVERS[h % DEFAULT_COVERS.length].url;
}

/** What a room's cover band shows: the chosen or uploaded picture, else the room's default. Never empty. */
export function coverUrl(b: RoomBranding, seed: string): string {
  return b.cover_url ?? defaultCoverFor(seed);
}

/** Tertulia teal, the product's action colour; the editor's "Reset" and the colour picker's initial value. */
export const DEFAULT_ACCENT = "#17706f";
/** Espresso, the product's near-black: the text on a light accent. */
export const INK = "#2b1d19";
export const URL_MAX = 2000;
const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** `#abc`, `#AABBCC` or `aabbcc` as lowercase `#aabbcc`; null for anything else. */
export function normalizeHex(input: string): string | null {
  const m = HEX.exec(input.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
}

/** http(s) URLs only, so a logo, a cover or a call-to-action target can never become `javascript:`. */
export function normalizeUrl(input: string): string | null {
  const s = input.trim();
  if (!s || s.length > URL_MAX) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A cover is one of the default pictures or an http(s) link to an upload; null for anything else. */
export function normalizeCoverUrl(input: string): string | null {
  const s = input.trim();
  return isDefaultCover(s) ? s : normalizeUrl(s);
}

/**
 * Strict parse for a save: every field that is present must be valid, so a host reads
 * "The call to action needs a web address" rather than silently losing it.
 */
export function parseBranding(raw: unknown): { branding: RoomBranding } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: RoomBranding = {};

  if (r.accent !== undefined && r.accent !== null && r.accent !== "") {
    if (typeof r.accent !== "string") return { error: "The accent colour must be a hex colour such as #17706f." };
    const hex = normalizeHex(r.accent);
    if (!hex) return { error: "The accent colour must be a hex colour such as #17706f." };
    if (hex !== DEFAULT_ACCENT) out.accent = hex;
  }

  if (r.logo_url !== undefined && r.logo_url !== null && r.logo_url !== "") {
    if (typeof r.logo_url !== "string") return { error: "The logo must be an uploaded picture." };
    const url = normalizeUrl(r.logo_url);
    if (!url) return { error: "The logo must be an uploaded picture." };
    out.logo_url = url;
    if (r.hide_name === true) out.hide_name = true;
  }

  if (r.cover_url !== undefined && r.cover_url !== null && r.cover_url !== "") {
    if (typeof r.cover_url !== "string") return { error: "The cover picture must be one of ours or an uploaded picture." };
    const url = normalizeCoverUrl(r.cover_url);
    if (!url) return { error: "The cover picture must be one of ours or an uploaded picture." };
    out.cover_url = url;
  }

  return { branding: out };
}

/** Lenient read for display: anything invalid is dropped, so a bad row never breaks the room. */
export function normalizeBranding(raw: unknown): RoomBranding {
  const parsed = parseBranding(raw);
  if ("branding" in parsed) return parsed.branding;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: RoomBranding = {};
  const accent = typeof r.accent === "string" ? normalizeHex(r.accent) : null;
  if (accent && accent !== DEFAULT_ACCENT) out.accent = accent;
  const logo = typeof r.logo_url === "string" ? normalizeUrl(r.logo_url) : null;
  if (logo) {
    out.logo_url = logo;
    if (r.hide_name === true) out.hide_name = true;
  }
  const cover = typeof r.cover_url === "string" ? normalizeCoverUrl(r.cover_url) : null;
  if (cover) out.cover_url = cover;
  return out;
}

/** False when the host chose to let the logo stand alone: the name then stays in the markup for assistive tech only. */
export function showsRoomName(raw: unknown): boolean {
  const b = normalizeBranding(raw);
  return !(b.logo_url && b.hide_name);
}

/** True when the host changed anything from the product default; one of the default covers does not count. */
export function isBranded(b: RoomBranding): boolean {
  return !!(b.accent || b.logo_url || (b.cover_url && !isDefaultCover(b.cover_url)));
}

function channel(c: number) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? DEFAULT_ACCENT;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** White or near-black, whichever reads better on the accent (contrast ratio against each). */
export function contrastText(hex: string): "#ffffff" | typeof INK {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / 0.05;
  return onWhite >= onDark ? "#ffffff" : INK;
}

export type BrandVars = Record<`--${string}`, string>;

/**
 * The CSS variables that restyle a subtree in the room's accent. Hover and soft tints are
 * derived with color-mix so one colour is enough; `--brand-ink` mixes with the scheme's ink,
 * so it darkens in light mode and lightens in dark mode.
 */
export function brandVars(b: RoomBranding): BrandVars | undefined {
  if (!b.accent) return undefined;
  const a = b.accent;
  return {
    "--brand": a,
    "--brand-hover": `color-mix(in srgb, ${a} 85%, black)`,
    "--brand-soft": `color-mix(in srgb, ${a} 14%, transparent)`,
    "--brand-ink": `color-mix(in srgb, ${a} 70%, var(--ink))`,
    "--brand-contrast": contrastText(a),
    "--focus": a,
  };
}
