import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { cancelStep, dispatch, resyncStep } from "@/lib/email/schedule";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { InviteEmail } from "@/lib/supabase/types";

type Body =
  | { action: "create"; invite_id: string; minutes_before: number; subject: string; body: string }
  | { action: "update"; id: string; minutes_before?: number | null; subject?: string; body?: string; enabled?: boolean }
  | { action: "delete"; id: string };

/**
 * Host edits to an event's email sequence. These go through the server rather than straight to
 * the table because every change has a Resend side: scheduled emails must be pulled back and
 * queued again, and a deleted step must cancel its emails before the rows cascade away.
 */
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
    const { data: invite } = await admin.from("invites").select("id, org_id").eq("id", body.invite_id).maybeSingle();
    if (!invite) throw new HttpError(404, "Event not found.");
    await requireOrgRole(user.id, invite.org_id, ["owner", "host"]);
    validate(body);
    const { data, error } = await admin
      .from("invite_emails")
      .insert({ org_id: invite.org_id, invite_id: invite.id, kind: "reminder", minutes_before: body.minutes_before, subject: body.subject.trim(), body: body.body })
      .select("*")
      .single();
    if (error) throw error;
    await resyncStep(data.id);
    return json({ step: data as InviteEmail });
  }

  const { data: step } = await admin.from("invite_emails").select("*").eq("id", body.id).maybeSingle();
  if (!step) throw new HttpError(404, "Email step not found.");
  await requireOrgRole(user.id, step.org_id, ["owner", "host"]);

  if (body.action === "delete") {
    if (step.kind === "confirmation") throw new HttpError(400, "The confirmation email can be switched off but not deleted.");
    await cancelStep(step.id);
    const { error } = await admin.from("invite_emails").delete().eq("id", step.id);
    if (error) throw error;
    return json({ ok: true });
  }

  validate(body);
  const patch: Partial<InviteEmail> = {};
  if (body.subject !== undefined) patch.subject = body.subject.trim();
  if (body.body !== undefined) patch.body = body.body;
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.minutes_before !== undefined && step.kind === "reminder" && body.minutes_before !== null) patch.minutes_before = body.minutes_before;
  const { data, error } = await admin.from("invite_emails").update(patch).eq("id", step.id).select("*").single();
  if (error) throw error;
  // Only timing, copy or enabled changes to a reminder move anything at Resend.
  const moved = patch.minutes_before !== undefined || patch.subject !== undefined || patch.body !== undefined || patch.enabled !== undefined;
  if (moved) {
    await resyncStep(step.id);
    await dispatch({ stepId: step.id });
  }
  return json({ step: data as InviteEmail });
});
