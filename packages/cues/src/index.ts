/**
 * Cue parser. A cue is one line in a slide's speaker notes:
 *
 *   #poll: Which channel brings you the most leads? | Email | LinkedIn | Referrals | Paid
 *   #multipoll: Which tools do you use? | Slack | Notion | Linear
 *   #text: What is your biggest blocker right now?
 *   #cta: Join the waitlist | embed | https://cueline.app/waitlist
 *   #cta: Buy the course | stripe | price_1Abc...
 *
 * Nothing else to configure. The parser is shared by deck sync (server) and the
 * extension popup (preview), so keep it dependency-free.
 */

export type PollCue = {
  kind: "poll" | "multipoll";
  question: string;
  options: string[];
};

export type TextCue = {
  kind: "text";
  question: string;
};

export type CtaDestination = "stripe" | "embed" | "tab";

export type CtaCue = {
  kind: "cta";
  label: string;
  destination: CtaDestination;
  target: string;
};

export type Cue = PollCue | TextCue | CtaCue;

export type ParsedNotes = {
  poll: PollCue | TextCue | null;
  cta: CtaCue | null;
  errors: string[];
};

const CUE_LINE = /^\s*#(poll|multipoll|text|cta)\s*:\s*(.+?)\s*$/i;
const DESTINATIONS: ReadonlySet<string> = new Set(["stripe", "embed", "tab"]);
const STRIPE_PRICE = /^price_[A-Za-z0-9]+$/;

function splitPipes(body: string): string[] {
  return body
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse a single line. Returns null when the line is not a cue. */
export function parseCueLine(line: string): { cue: Cue | null; error: string | null } {
  const m = CUE_LINE.exec(line);
  if (!m) return { cue: null, error: null };
  const tag = m[1].toLowerCase();
  const parts = splitPipes(m[2]);

  switch (tag) {
    case "poll":
    case "multipoll": {
      const [question, ...options] = parts;
      if (!question) return { cue: null, error: `#${tag}: missing question` };
      if (options.length < 2) return { cue: null, error: `#${tag}: needs at least two options` };
      if (options.length > 10) return { cue: null, error: `#${tag}: at most ten options` };
      return { cue: { kind: tag, question, options }, error: null };
    }
    case "text": {
      const [question] = parts;
      if (!question) return { cue: null, error: "#text: missing question" };
      return { cue: { kind: "text", question }, error: null };
    }
    case "cta": {
      const [label, destination, target] = parts;
      if (!label || !destination || !target) {
        return { cue: null, error: "#cta: expected `label | stripe|embed|tab | target`" };
      }
      const dest = destination.toLowerCase();
      if (!DESTINATIONS.has(dest)) {
        return { cue: null, error: `#cta: unknown destination "${destination}"` };
      }
      if (dest === "stripe" && !STRIPE_PRICE.test(target)) {
        return { cue: null, error: "#cta: stripe target must be a price_… id" };
      }
      if (dest !== "stripe" && !/^https?:\/\//i.test(target)) {
        return { cue: null, error: "#cta: target must be an http(s) URL" };
      }
      return { cue: { kind: "cta", label, destination: dest as CtaDestination, target }, error: null };
    }
    default:
      return { cue: null, error: null };
  }
}

/**
 * Parse a slide's speaker notes. At most one poll-type cue and one CTA per slide;
 * later duplicates are reported as errors and ignored.
 */
export function parseNotes(notes: string | null | undefined): ParsedNotes {
  const out: ParsedNotes = { poll: null, cta: null, errors: [] };
  if (!notes) return out;
  for (const raw of notes.split(/\r?\n/)) {
    const { cue, error } = parseCueLine(raw);
    if (error) {
      out.errors.push(error);
      continue;
    }
    if (!cue) continue;
    if (cue.kind === "cta") {
      if (out.cta) out.errors.push("#cta: only one CTA per slide");
      else out.cta = cue;
    } else {
      if (out.poll) out.errors.push(`#${cue.kind}: only one poll per slide`);
      else out.poll = cue;
    }
  }
  return out;
}

/** True when the notes contain any cue, valid or not. Useful for quick highlighting. */
export function hasCue(notes: string | null | undefined): boolean {
  return !!notes && /^\s*#(poll|multipoll|text|cta)\s*:/im.test(notes);
}
