import type { SupabaseClient } from "@supabase/supabase-js";
import { billingPeriod, isFalseStart } from "@/lib/billing";
import { stopEgress } from "@/lib/video";

type EndableSession = {
  id: string;
  org_id: string;
  egress_id: string | null;
  started_at: string | null;
  counted: boolean;
};

/**
 * End a session: stop its egress, stamp ended_at, and give a false start back to the plan.
 * Shared by the host's "End session", the hard stop at `ends_by`, and the sweep that runs
 * before another session in the organisation goes live.
 */
export async function endSession(admin: SupabaseClient, session: EndableSession, now = new Date()) {
  for (const id of String(session.egress_id ?? "").split(",").filter(Boolean)) await stopEgress(id);
  const ended_at = now.toISOString();
  let counted = session.counted;

  if (counted && session.started_at) {
    const [{ count: attendees }, { data: org }] = await Promise.all([
      admin.from("participants").select("user_id", { count: "exact", head: true }).eq("session_id", session.id),
      admin.from("organisations").select("id, plan, plan_status, plan_period_start, plan_period_end").eq("id", session.org_id).maybeSingle(),
    ]);
    const period = billingPeriod(org ?? { id: session.org_id, plan: "free" }, now);
    const { count: refunded } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", session.org_id)
      .eq("counted", false)
      .eq("state", "ended")
      .gte("started_at", period.start.toISOString())
      .lt("started_at", period.end.toISOString());
    if (isFalseStart({ started_at: session.started_at, ended_at }, attendees ?? 0, refunded ?? 0)) counted = false;
  }

  const { error } = await admin.from("sessions").update({ state: "ended", ended_at, counted }).eq("id", session.id);
  if (error) throw error;
  return { counted };
}

/** End every live session of the organisation that has run past its hard stop. */
export async function sweepOverdue(admin: SupabaseClient, orgId: string, now = new Date()) {
  const { data } = await admin
    .from("sessions")
    .select("id, org_id, egress_id, started_at, counted")
    .eq("org_id", orgId)
    .eq("state", "live")
    .lt("ends_by", now.toISOString());
  for (const s of (data ?? []) as EndableSession[]) await endSession(admin, s, now);
  return (data ?? []).length;
}
