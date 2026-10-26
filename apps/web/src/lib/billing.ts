/**
 * Plan enforcement, per room: what a room's plan allows and whether the room is locked, which
 * billing month a session falls in, how many sessions the room has used in it, and whether
 * the next one may go live. Pure functions here are unit-tested; the loaders at the bottom
 * read Supabase with the service client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Plan, type PlanLimits, planLimits } from "@/lib/plans";
import type { PlanStatus } from "@/lib/supabase/types";

/** The plan columns of a room, plus the subscription period when there is one. */
export type PlanRow = {
  id: string;
  plan: Plan | string;
  plan_status?: PlanStatus | string | null;
  complimentary?: boolean | null;
  plan_period_start?: string | null;
  plan_period_end?: string | null;
};

export type Period = { start: Date; end: Date };

/**
 * The month a plan's session count resets in. A paid plan follows the Stripe billing period
 * (a yearly plan still resets monthly, on the day of the month it started). Free, and a paid
 * plan whose period Stripe has not told us yet, use the calendar month in UTC.
 */
export function billingPeriod(row: Pick<PlanRow, "plan_period_start" | "plan_period_end">, now = new Date()): Period {
  const start = row.plan_period_start ? new Date(row.plan_period_start) : null;
  const end = row.plan_period_end ? new Date(row.plan_period_end) : null;
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

/** The paid plan a row holds right now: past due keeps it, cancelled and unpaid do not. */
export function effectivePlan(row: Pick<PlanRow, "plan" | "plan_status" | "complimentary">): Plan {
  if (row.complimentary) return "pro";
  if (row.plan_status === "canceled" || row.plan_status === "unpaid") return "free";
  const p = row.plan;
  return p === "starter" || p === "pro" ? p : "free";
}

/**
 * What a room may do, from its plan and its place in the organisation. A room is either the
 * organisation's single free room or a paid one: a room with no paid plan is free while it is
 * the only room and locked otherwise (the subscription lapsed, or the first payment never came
 * through), so a free room never sits next to a paid one. Complimentary rooms (made by a
 * platform admin) run at Pro and are never locked.
 */
export type RoomAccess = {
  tier: Plan;
  limits: PlanLimits;
  /** The room cannot open, go live or take new events until it is paid or the others are gone. */
  locked: boolean;
  /** Why it is locked, for the host. */
  reason: string | null;
  /** The room holds a paid plan (active or past due). */
  paid: boolean;
  complimentary: boolean;
};

export function roomAccess(room: Pick<PlanRow, "plan" | "plan_status" | "complimentary">, roomsInOrg: number): RoomAccess {
  const tier = effectivePlan(room);
  const complimentary = !!room.complimentary;
  const paid = !complimentary && tier !== "free";
  if (complimentary || paid) return { tier, limits: planLimits(tier), locked: false, reason: null, paid, complimentary };
  if (roomsInOrg <= 1) return { tier: "free", limits: planLimits("free"), locked: false, reason: null, paid: false, complimentary: false };
  const reason =
    room.plan_status === "unpaid"
      ? "This room's first payment has not come through yet. Complete it on the billing page, or delete the room."
      : "This room has no plan and the organisation has other rooms. A room is either the only one (free) or paid: upgrade it on the billing page, or delete the others down to one.";
  return { tier: "free", limits: planLimits("free"), locked: true, reason, paid: false, complimentary: false };
}

export type Usage = {
  period: Period;
  /** Sessions that went live in the period and still count. */
  used: number;
  limits: PlanLimits;
  effectivePlan: Plan;
  access: RoomAccess;
};

export type GoLiveDecision = { allowed: true; limits: PlanLimits } | { allowed: false; reason: string; limits: PlanLimits };

/** May the room start one more session right now? Pro is unlimited in count; a locked room never may. */
export function decideGoLive(u: Usage): GoLiveDecision {
  if (u.access.locked) return { allowed: false, reason: u.access.reason ?? "This room is locked.", limits: u.limits };
  const cap = u.limits.sessionsPerMonth;
  if (cap === null || u.used < cap) return { allowed: true, limits: u.limits };
  const plan = u.limits.label;
  const next = u.period.end.toISOString().slice(0, 10);
  const reason =
    u.effectivePlan === "free"
      ? `A free room includes one session a month and this month's has been used (resets ${next}). Upgrade this room to Starter at /host/billing to go live now.`
      : `${plan} includes ${cap} sessions a month and all ${cap} have been used in this room (resets ${next}). Move this room to Pro at /host/billing for unlimited sessions.`;
  return { allowed: false, reason, limits: u.limits };
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

export type LoadedRoom = {
  room: PlanRow & { org_id: string; name: string; slug: string };
  access: RoomAccess;
  roomsInOrg: number;
};

/** A room's plan as it applies right now: the row, its subscription period, and what it may do. */
export async function loadRoomAccess(admin: SupabaseClient, roomId: string): Promise<LoadedRoom | null> {
  const { data: room } = await admin.from("rooms").select("id, org_id, name, slug, plan, plan_status, complimentary").eq("id", roomId).maybeSingle();
  if (!room) return null;
  const [{ count }, { data: sub }] = await Promise.all([
    admin.from("rooms").select("id", { count: "exact", head: true }).eq("org_id", room.org_id),
    admin.from("room_subscriptions").select("current_period_start, current_period_end").eq("room_id", room.id).maybeSingle(),
  ]);
  const roomsInOrg = count ?? 1;
  const row = { ...room, plan_period_start: sub?.current_period_start ?? null, plan_period_end: sub?.current_period_end ?? null };
  return { room: row, access: roomAccess(row, roomsInOrg), roomsInOrg };
}

export async function loadUsage(admin: SupabaseClient, loaded: LoadedRoom, now = new Date()): Promise<Usage> {
  const period = billingPeriod(loaded.room, now);
  const { count: used } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("room_id", loaded.room.id)
    .eq("counted", true)
    .gte("started_at", period.start.toISOString())
    .lt("started_at", period.end.toISOString());
  return { period, used: used ?? 0, limits: loaded.access.limits, effectivePlan: loaded.access.tier, access: loaded.access };
}
