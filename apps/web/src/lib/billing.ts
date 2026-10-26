/**
 * Plan enforcement: which billing month a session falls in, how many sessions the organisation
 * has used in it, and whether the next one may go live. Pure functions here are unit-tested;
 * the loaders at the bottom read Supabase with the service client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Plan, type PlanLimits, planLimits } from "@/lib/plans";

export type BillingOrg = {
  id: string;
  plan: Plan | string;
  plan_status?: string | null;
  plan_period_start?: string | null;
  plan_period_end?: string | null;
  extra_rooms?: number | null;
};

export type Period = { start: Date; end: Date };

/**
 * The month a plan's session count resets in. A paid plan follows the Stripe billing period
 * (a yearly plan still resets monthly, on the day of the month it started). Free, and a paid
 * plan whose period Stripe has not told us yet, use the calendar month in UTC.
 */
export function billingPeriod(org: BillingOrg, now = new Date()): Period {
  const start = org.plan_period_start ? new Date(org.plan_period_start) : null;
  const end = org.plan_period_end ? new Date(org.plan_period_end) : null;
  if (start && end && end > start && now >= start && now < end) {
    const monthly = monthlyWindow(start, now);
    return monthly.end < end ? monthly : { start: monthly.start, end };
  }
  const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: s, end: e };
}

/**
 * The monthly window anchored on the subscription's start day that contains `now`. Each window
 * is computed from the anchor by whole months (not by stepping), so a plan started on the 31st
 * keeps resetting on the 31st, or the last day of shorter months, instead of drifting.
 */
function monthlyWindow(anchor: Date, now: Date): Period {
  let n = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  if (addMonths(anchor, n) > now) n -= 1;
  else if (addMonths(anchor, n + 1) <= now) n += 1;
  return { start: addMonths(anchor, n), end: addMonths(anchor, n + 1) };
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

export type Usage = {
  period: Period;
  /** Sessions that went live in the period and still count. */
  used: number;
  limits: PlanLimits;
  /** A past-due subscription keeps its plan until Stripe cancels it; a cancelled one is free. */
  effectivePlan: Plan;
};

export type GoLiveDecision = { allowed: true; limits: PlanLimits } | { allowed: false; reason: string; limits: PlanLimits };

/** May the organisation start one more session right now? Pro is unlimited in count. */
export function decideGoLive(u: Usage): GoLiveDecision {
  const cap = u.limits.sessionsPerMonth;
  if (cap === null || u.used < cap) return { allowed: true, limits: u.limits };
  const plan = u.limits.label;
  const next = u.period.end.toISOString().slice(0, 10);
  const reason =
    u.effectivePlan === "free"
      ? `The free plan includes one session a month and this month's has been used (resets ${next}). Upgrade to Starter at /host/billing to go live now.`
      : `${plan} includes ${cap} sessions a month and all ${cap} have been used (resets ${next}). Upgrade to Pro at /host/billing for unlimited sessions.`;
  return { allowed: false, reason, limits: u.limits };
}

export function effectivePlan(org: BillingOrg): Plan {
  if (org.plan_status === "canceled") return "free";
  const p = org.plan;
  return p === "starter" || p === "pro" ? p : "free";
}

/**
 * A false start gives the session back: it ended within two minutes of going live with no
 * attendee ever in the room, and nothing has been refunded this period yet.
 */
export function isFalseStart(s: { started_at: string | null; ended_at: string | null }, attendees: number, refundedThisPeriod: number): boolean {
  if (!s.started_at || !s.ended_at || attendees > 0 || refundedThisPeriod > 0) return false;
  return new Date(s.ended_at).getTime() - new Date(s.started_at).getTime() <= 2 * 60 * 1000;
}

export function endsBy(startedAt: Date, limits: PlanLimits): Date {
  return new Date(startedAt.getTime() + limits.minutes * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Loaders (service client)
// ---------------------------------------------------------------------------

export async function loadUsage(admin: SupabaseClient, org: BillingOrg, now = new Date()): Promise<Usage> {
  const period = billingPeriod(org, now);
  const plan = effectivePlan(org);
  const { count: used } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("counted", true)
    .gte("started_at", period.start.toISOString())
    .lt("started_at", period.end.toISOString());
  return { period, used: used ?? 0, limits: planLimits(plan), effectivePlan: plan };
}

/** The organisation's plan as it applies right now: the row, the effective plan and its limits. */
export async function loadOrgPlan(admin: SupabaseClient, orgId: string): Promise<{ org: BillingOrg & { extra_rooms: number }; plan: Plan; limits: PlanLimits } | null> {
  const { data } = await admin.from("organisations").select("id, plan, plan_status, plan_period_start, plan_period_end, extra_rooms").eq("id", orgId).maybeSingle();
  if (!data) return null;
  const org = { ...data, extra_rooms: data.extra_rooms ?? 0 } as BillingOrg & { extra_rooms: number };
  const plan = effectivePlan(org);
  return { org, plan, limits: planLimits(plan) };
}
