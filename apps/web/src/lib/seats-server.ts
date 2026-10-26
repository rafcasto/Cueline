import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOrgPlan } from "@/lib/billing";
import { applyPlanToEmails, queueRegistrationEmails } from "@/lib/email/schedule";
import { capacityFor } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Fill the free seats of an event from its waiting list (the database picks who, earliest
 * first) and send each person promoted their welcome and reminders. Called when a seat frees
 * (someone opts out), when the host adds seats, and when the plan grows.
 */
export async function promoteWaitlist(admin: SupabaseClient, invite: { id: string; capacity: number | null }, limits: { participants: number }): Promise<string[]> {
  const { data, error } = await admin.rpc("promote_waitlist", { p_invite: invite.id, p_capacity: capacityFor(invite, limits) });
  if (error) throw error;
  const ids = ((data ?? []) as { registration_id: string }[]).map((r) => r.registration_id);
  for (const id of ids) {
    try {
      await queueRegistrationEmails(id);
    } catch (err) {
      console.error("waitlist promotion email", id, err);
    }
  }
  return ids;
}

/** After a plan change: seats may have grown, and reminders may have been switched on or off. */
export async function afterPlanChange(orgId: string) {
  const admin = supabaseAdmin();
  const planned = await loadOrgPlan(admin, orgId);
  if (!planned) return;
  const { data: invites } = await admin.from("invites").select("id, capacity").eq("org_id", orgId).is("revoked_at", null);
  for (const inv of invites ?? []) {
    try {
      await promoteWaitlist(admin, inv, planned.limits);
    } catch (err) {
      console.error("waitlist after plan change", inv.id, err);
    }
  }
  await applyPlanToEmails(orgId);
}
