/**
 * The buttons of a call-to-action activity. A call to action is one overlay over the slides with
 * a title and up to CTA_BUTTONS_MAX buttons, each with its own destination (Stripe checkout, an
 * embedded page or a new tab) and target. The buttons live in `activities.config.buttons`; rows
 * from before groups carry one destination and target at the top of `config`, which reads as a
 * single button without a label (it says "Open" or "Buy now", as it always did). Pure functions
 * shared by the host form, the attendee overlay and the API, unit-tested without a browser.
 */
import { normalizeUrl } from "@/lib/branding";
import type { Activity, CtaConfig, CtaDestination } from "@/lib/supabase/types";

export type CtaButton = { label: string; destination: CtaDestination; target: string };

export const CTA_BUTTONS_MAX = 3;
export const CTA_BUTTON_LABEL_MAX = 40;
const DESTINATIONS: CtaDestination[] = ["stripe", "embed", "tab"];
const ORDINAL = ["first", "second", "third"];

function asDestination(v: unknown): CtaDestination {
  return DESTINATIONS.includes(v as CtaDestination) ? (v as CtaDestination) : "tab";
}

/** A blank button, for the form. */
export function emptyCtaButton(): CtaButton {
  return { label: "", destination: "tab", target: "" };
}

/**
 * The buttons of a call to action, in order, never empty: `config.buttons` (capped, anything that
 * is not an object dropped), or the one button a row from before groups describes at the top of
 * its config.
 */
export function ctaButtons(activity: Pick<Activity, "config">): CtaButton[] {
  const c = (activity.config ?? {}) as Partial<CtaConfig>;
  const raw = Array.isArray(c.buttons) ? c.buttons : [];
  const list = raw
    .filter((b): b is CtaButton => !!b && typeof b === "object")
    .slice(0, CTA_BUTTONS_MAX)
    .map((b) => ({ label: String(b.label ?? "").trim(), destination: asDestination(b.destination), target: String(b.target ?? "").trim() }));
  if (list.length) return list;
  return [{ label: "", destination: asDestination(c.destination), target: String(c.target ?? "").trim() }];
}

/** What a button says: its label, or the generic word a button from before labels always said. */
export function ctaButtonText(b: CtaButton): string {
  return b.label || (b.destination === "stripe" ? "Buy now" : "Open");
}

/** "first button", "second button", … for error messages. */
function buttonName(i: number) {
  return `The ${ORDINAL[i] ?? `${i + 1}th`} button`;
}

/**
 * Strict parse for a save: one to three buttons, each with a target that fits its destination
 * (a Stripe price id, or an https address), and a label on every button once there is more than
 * one, since "Open" three times says nothing. The config keeps the first button's destination and
 * target at its top as well, so a build from before groups still reads the row.
 */
export function parseCtaButtons(raw: CtaButton[]): { config: CtaConfig } | { error: string } {
  const buttons = raw.map((b) => ({ label: b.label.trim(), destination: asDestination(b.destination), target: b.target.trim() }));
  if (buttons.length < 1) return { error: "A call to action needs at least one button." };
  if (buttons.length > CTA_BUTTONS_MAX) return { error: `A call to action can have up to ${CTA_BUTTONS_MAX} buttons.` };
  for (const [i, b] of buttons.entries()) {
    if (buttons.length > 1 && !b.label) return { error: `${buttonName(i)} needs a label.` };
    if (b.label.length > CTA_BUTTON_LABEL_MAX) return { error: `${buttonName(i)} label must be ${CTA_BUTTON_LABEL_MAX} characters or fewer.` };
    if (b.destination === "stripe") {
      if (!/^price_[A-Za-z0-9]+$/.test(b.target)) return { error: `${buttonName(i)} needs a Stripe price id (price_…).` };
    } else {
      const url = normalizeUrl(b.target);
      if (!url) return { error: `${buttonName(i)} needs a web address starting with https://.` };
      b.target = url;
    }
  }
  return { config: { destination: buttons[0].destination, target: buttons[0].target, buttons } };
}
