/**
 * What each plan allows. The single place every gate reads from; see docs/BUSINESS-MODEL.md.
 * A plan belongs to a room: the organisation's single room is free until upgraded, and every
 * further room is bought on Starter or Pro (roomAccess() in lib/billing turns a room row into
 * its limits). Nothing here is stored in Stripe: a product only carries `metadata.plan`, and
 * prices are found by lookup key, so a cap can change without touching the Dashboard.
 */
export type Plan = "free" | "starter" | "pro";

export type PlanLimits = {
  label: string;
  /** Sessions that may go live per billing month; null is unlimited. */
  sessionsPerMonth: number | null;
  /** Attendees per session, presenters not counted. */
  participants: number;
  /** Session length in minutes, counted from go-live; a hard stop. */
  minutes: number;
  /** The session is filmed as the attendees saw it and kept for the host to download. Pro only. */
  recording: boolean;
  /** How long a recording is kept before the nightly sweep deletes it; null where there is no recording. */
  recordingDays: number | null;
  /** The Insights tab: registered against attended, engagement and fit scores. Pro only. */
  insights: boolean;
  /** The HLS fallback for viewers the room cannot take. It is an egress, so it follows recording. */
  hlsFallback: boolean;
  /** Attendees on stage at the same time. */
  promoteSlots: number;
  /** Stripe checkout as a call-to-action destination. */
  stripeCta: boolean;
  /** Fair-use pool in participant-hours per month; null is not stated. */
  poolParticipantHours: number | null;
  /** Reminder emails before each event. Every plan sends the welcome and the waiting-list note. */
  reminders: boolean;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    label: "Free",
    sessionsPerMonth: 1,
    participants: 10,
    minutes: 20,
    recording: false,
    recordingDays: null,
    insights: false,
    hlsFallback: false,
    promoteSlots: 0,
    stripeCta: false,
    poolParticipantHours: null,
    reminders: false,
  },
  starter: {
    label: "Starter",
    sessionsPerMonth: 4,
    participants: 50,
    minutes: 120,
    recording: false,
    recordingDays: null,
    insights: false,
    hlsFallback: false,
    promoteSlots: 1,
    stripeCta: false,
    poolParticipantHours: 300,
    reminders: true,
  },
  pro: {
    label: "Pro",
    sessionsPerMonth: null,
    participants: 150,
    minutes: 240,
    recording: true,
    recordingDays: 365,
    insights: true,
    hlsFallback: true,
    promoteSlots: 3,
    stripeCta: true,
    poolParticipantHours: 1200,
    reminders: true,
  },
};

/** Stripe price lookup keys and what buying each one grants. Both Stripe modes carry the same keys. */
export const PRICE_LOOKUPS = {
  starter_monthly: "starter",
  starter_yearly: "starter",
  pro_monthly: "pro",
  pro_yearly: "pro",
} as const satisfies Record<string, Plan>;
export type PriceLookup = keyof typeof PRICE_LOOKUPS;

export const PRICE_LABELS: Record<PriceLookup, { amount: string; period: string }> = {
  starter_monthly: { amount: "$29", period: "month" },
  starter_yearly: { amount: "$290", period: "year" },
  pro_monthly: { amount: "$79", period: "month" },
  pro_yearly: { amount: "$790", period: "year" },
};

export function isPriceLookup(v: unknown): v is PriceLookup {
  return typeof v === "string" && v in PRICE_LOOKUPS;
}

export function isPlan(v: unknown): v is Plan {
  return v === "free" || v === "starter" || v === "pro";
}

/** The plan a Stripe price grants, from its lookup key or, failing that, the product's `plan` metadata. */
export function planFromPrice(lookupKey: string | null | undefined, productPlan: string | null | undefined): Plan | null {
  if (lookupKey && isPriceLookup(lookupKey)) return PRICE_LOOKUPS[lookupKey];
  return isPlan(productPlan) ? productPlan : null;
}

export function planLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[isPlan(plan) ? plan : "free"];
}

export type PaidPlan = Exclude<Plan, "free">;

/** The one step up from a plan: what a gate on a cap (sessions, length, seats) offers. */
export const NEXT_PLAN: Record<Plan, PaidPlan | null> = { free: "starter", starter: "pro", pro: null };

export function nextPlan(plan: string | null | undefined): PaidPlan | null {
  return NEXT_PLAN[isPlan(plan) ? plan : "free"];
}

/** The cheapest plan that seats this many in a session: what a gate on an event's seats offers. */
export function planWithParticipants(n: number): PaidPlan {
  return PLAN_LIMITS.starter.participants >= n ? "starter" : "pro";
}

/** The cheapest plan that switches a feature on: what a gate on a feature (recording, insights, reminders) offers. */
export function planThatIncludes(feature: { [K in keyof PlanLimits]: PlanLimits[K] extends boolean ? K : never }[keyof PlanLimits]): PaidPlan {
  return PLAN_LIMITS.starter[feature] ? "starter" : "pro";
}
