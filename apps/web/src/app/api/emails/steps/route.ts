import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { loadOrgPlan } from "@/lib/billing";
import { cancelRoomStep, syncRoomStep } from "@/lib/email/schedule";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { RoomEmail } from "@/lib/supabase/types";

type Body =
  | { action: "create"; room_id: string; minutes_before: number; subject: string; body: string }
  | { action: "update"; id: string; minutes_before?: number | null; subject?: string; body?: string; enabled?: boolean }
  | { action: "delete"; id: string };

/**
 * Host edits to a room's email sequence. Every change is pushed to the inherited copy on each
 * active event in the room and has a Resend side: scheduled emails are pulled back and queued
 * again against each event's start time, and a deleted step cancels its emails before the
 * inherited rows cascade away. Reminders are a paid feature: on the free plan they can be read
 * but not added, edited or switched on (the welcome and the waiting-list note always can).
 */
const PAID_ONLY = "Reminders before the event are on Starter and Pro. The free plan sends the welcome email on registration; upgrade at /host/billing to schedule reminders.";

async function requireReminders(orgId: string) {
  const planned = await loadOrgPlan(supabaseAdmin(), orgId);
  if (!planned?.limits.reminders) throw new HttpError(402, PAID_ONLY);
}
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const validate = (p: { minutes_before?: number | null; subject?: string; body?: string }) => {
    if (p.minutes_before !== undefined && p.minutes_before !== null && (!Number.isInteger(p.minutes_before) || p.minutes_before < 1 || p.minutes_before > 60 * 24 * 60))
      throw new HttpError(400, "Send time must be between 1 minute and 60 days before the start.");
    if (p.subject !== undefined && (p.subject.trim().length < 1 || p.subject.length > 200)) throw new HttpError(400, "Subject must be 1 to 200 characters.");
    if (p.body !== undefined && (p.body.trim().length < 1 || p.body.length > 5000)) throw new HttpError(400, "Body must be 1 to 5000 characters.");
  };

  if (body.action === "create") {
    const { data: room } = await admin.from("rooms").select("id, org_id").eq("id", body.room_id).maybeSingle();
    if (!room) throw new HttpError(404, "Room not found.");
    await requireOrgRole(user.id, room.org_id, ["owner", "host"]);
    await requireReminders(room.org_id);
    validate(body);
    const { data, error } = await admin
      .from("room_emails")
      .insert({ org_id: room.org_id, room_id: room.id, kind: "reminder", minutes_before: body.minutes_before, subject: body.subject.trim(), body: body.body })
      .select("*")
      .single();
    if (error) throw error;
    await syncRoomStep(data.id);
    return json({ step: data as RoomEmail });
  }

  const { data: step } = await admin.from("room_emails").select("*").eq("id", body.id).maybeSingle();
  if (!step) throw new HttpError(404, "Email step not found.");
  await requireOrgRole(user.id, step.org_id, ["owner", "host"]);

  if (body.action === "delete") {
    if (step.kind !== "reminder") throw new HttpError(400, step.kind === "confirmation" ? "The welcome email can be switched off but not deleted." : "The waiting-list email can be switched off but not deleted.");
    await cancelRoomStep(step.id);
    const { error } = await admin.from("room_emails").delete().eq("id", step.id);
    if (error) throw error;
    return json({ ok: true });
  }

  validate(body);
  // A reminder can be switched off on any plan; everything else about it needs a paid plan.
  if (step.kind === "reminder" && !(Object.keys(body).every((k) => ["action", "id", "enabled"].includes(k)) && body.enabled === false)) await requireReminders(step.org_id);
  const patch: Partial<RoomEmail> = {};
  if (body.subject !== undefined) patch.subject = body.subject.trim();
  if (body.body !== undefined) patch.body = body.body;
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.minutes_before !== undefined && step.kind === "reminder" && body.minutes_before !== null) patch.minutes_before = body.minutes_before;
  if (Object.keys(patch).length === 0) return json({ step: step as RoomEmail });
  const { data, error } = await admin.from("room_emails").update(patch).eq("id", step.id).select("*").single();
  if (error) throw error;
  await syncRoomStep(step.id);
  return json({ step: data as RoomEmail });
});
