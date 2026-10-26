/**
 * Email copy lives in the database as plain text with {{placeholders}}; this renders it for one
 * registrant. Pure functions, so the host panel preview and the server render identically.
 */
export const PLACEHOLDERS = ["name", "first_name", "title", "starts_at", "link", "code", "join_url", "room", "cancel_url"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type TemplateVars = Record<Placeholder, string>;

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key as Placeholder] : m));
}

/** Variables for one registrant. `startsAt` null renders as a sentence rather than an empty slot. */
export function templateVars(input: {
  name: string;
  title: string;
  room: string;
  startsAt: string | null;
  timezone: string;
  accessToken: string;
  code: string;
  appUrl: string;
}): TemplateVars {
  const base = input.appUrl.replace(/\/$/, "");
  return {
    name: input.name,
    first_name: input.name.trim().split(/\s+/)[0] ?? input.name,
    title: input.title,
    room: input.room,
    starts_at: input.startsAt ? formatInZone(input.startsAt, input.timezone) : "time to be announced",
    link: `${base}/a/${input.accessToken}`,
    code: input.code,
    join_url: `${base}/join`,
    // Opting out: frees the seat for the waiting list. Same token as the personal link, so it works from any device.
    cancel_url: `${base}/a/${input.accessToken}/cancel`,
  };
}

export function formatInZone(iso: string, timezone: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: timezone, timeZoneName: "short" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(d);
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Plain text to a restrained HTML email: paragraphs, bare URLs become links, the personal link
 * also gets a button. No layout tables, no images, so it renders the same everywhere.
 */
export function textToHtml(text: string, opts: { buttonUrl?: string; buttonLabel?: string } = {}): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => {
      const escaped = escapeHtml(p).replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#4f46e5">${u}</a>`);
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f2937">${escaped.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  const button = opts.buttonUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.buttonUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 20px;border-radius:8px">${escapeHtml(opts.buttonLabel ?? "Open your link")}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">${paragraphs}${button}</div></body></html>`;
}

/** When a reminder step goes out for an event, or null when it cannot be computed. */
export function sendTimeFor(step: { kind: "confirmation" | "reminder" | "waitlist"; minutes_before: number | null }, startsAt: string | null, now = Date.now()): Date | null {
  if (step.kind !== "reminder") return new Date(now);
  if (!startsAt || step.minutes_before === null) return null;
  return new Date(new Date(startsAt).getTime() - step.minutes_before * 60_000);
}

/** Minutes-before as the host reads it: "2 days before", "15 minutes before". */
export function describeOffset(minutes: number | null, kind?: "confirmation" | "reminder" | "waitlist"): string {
  if (kind === "waitlist") return "On joining the waiting list";
  if (minutes === null) return "On registration";
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"} before`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"} before`;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} before`;
}
