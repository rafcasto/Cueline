/**
 * What each plan allows. The single place every gate reads from; see docs/BUSINESS-MODEL.md.
 * Nothing here is stored in Stripe: a product only carries `metadata.plan`, and prices are found
 * by lookup key, so a cap can change without touching the Dashboard.
 */
export type Plan = "free" | "starter" | "pro";
export type Purchasable = Plan | "event_pass";

export type PlanLimits = {
  label: string;
  /** Sessions that may go live per billing month; null is unlimited. */
  sessionsPerMonth: number | null;
  /** Attendees per session, presenters not counted. */
  participants: number;
  /** Session length in minutes, counted from go-live; a hard stop. */
  minutes: number;
  recording: boolean;
  /** The HLS fallback for viewers the room cannot take. It is an egress, so it follows recording. */
  hlsFallback: boolean;
  /** Attendees on stage at the same time. */
  promoteSlots: number;
  /** Stripe checkout as a call-to-action destination. */
  stripeCta: boolean;
  /** Fair-use pool in participant-hours per month; null is not stated. */
  poolParticipantHours: number | null;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    label: "Free",
    sessionsPerMonth: 1,
    participants: 10,
    minutes: 20,
    recording: false,
    hlsFallback: false,
    promoteSlots: 0,
    stripeCta: false,
    poolParticipantHours: null,
  },
  starter: {
    label: "Starter",
    sessionsPerMonth: 4,
    participants: 50,
    minutes: 120,
    recording: true,
    hlsFallback: false,
    promoteSlots: 1,
    stripeCta: false,
    poolParticipantHours: 300,
  },
  pro: {
    label: "Pro",
    sessionsPerMonth: null,
    participants: 150,
    minutes: 240,
    recording: true,
    hlsFallback: true,
    promoteSlots: 3,
    stripeCta: true,
    poolParticipantHours: 1200,
  },
};

/** One session on an event pass, whatever the plan. */
export const EVENT_PASS_LIMITS: PlanLimits = {
  label: "Event pass",
  sessionsPerMonth: 1,
  participants: 50,
  minutes: 180,
  recording: true,
  hlsFallback: false,
  promoteSlots: 1,
  stripeCta: false,
  poolParticipantHours: 150,
};

/** Stripe price lookup keys and what buying each one grants. Both Stripe modes carry the same keys. */
export const PRICE_LOOKUPS = {
  starter_monthly: "starter",
  starter_yearly: "starter",
  pro_monthly: "pro",
  pro_yearly: "pro",
  event_pass: "event_pass",
} as const satisfies Record<string, Purchasable>;
export type PriceLookup = keyof typeof PRICE_LOOKUPS;

export const PRICE_LABELS: Record<PriceLookup, { amount: string; period: string }> = {
  starter_monthly: { amount: "$29", period: "month" },
  starter_yearly: { amount: "$290", period: "year" },
  pro_monthly: { amount: "$79", period: "month" },
  pro_yearly: { amount: "$790", period: "year" },
  event_pass: { amount: "$19", period: "event" },
};

export function isPriceLookup(v: unknown): v is PriceLookup {
  return typeof v === "string" && v in PRICE_LOOKUPS;
}

export function isPlan(v: unknown): v is Plan {
  return v === "free" || v === "starter" || v === "pro";
}

/** The plan a Stripe price grants, from its lookup key or, failing that, the product's `plan` metadata. */
export function planFromPrice(lookupKey: string | null | undefined, productPlan: string | null | undefined): Plan | null {
  if (lookupKey && isPriceLookup(lookupKey)) {
    const p = PRICE_LOOKUPS[lookupKey];
    return p === "event_pass" ? null : p;
  }
  return isPlan(productPlan) ? productPlan : null;
}

export function planLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[isPlan(plan) ? plan : "free"];
}
