import { publicEnv } from "@/lib/env";
import { emailConfigured, resend, RESEND_SCHEDULE_HORIZON_MS } from "@/lib/email/resend";
import { renderTemplate, sendTimeFor, templateVars, textToHtml } from "@/lib/email/template";
import { loadRoomAccess } from "@/lib/billing";
import { stepKindsFor } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Invite, InviteEmail, Registration, RegistrationEmail } from "@/lib/supabase/types";

/**
 * Turns an invite's email sequence into scheduled Resend emails, one per registrant per step.
 *
 * Rows in registration_emails are the source of truth; Resend holds the scheduled copy. The
 * flow is always: queue rows (cheap, idempotent) then dispatch (talks to Resend). Dispatch
 * runs right after a registration or a host edit and again from the cron route, which picks
 * up anything that was further out than Resend's scheduling horizon at the time.
 */

/** A reminder whose time passed less than this long ago still goes out (it is "now"). */
const PAST_GRACE_MS = 10 * 60_000;
/** Anything due within this window is sent immediately rather than scheduled. */
const IMMEDIATE_MS = 60_000;

type StepRow = Pick<InviteEmail, "id" | "kind" | "minutes_before" | "enabled">;

function sendAtFor(step: StepRow, startsAt: string | null, now: number): string | null {
  const at = sendTimeFor(step, startsAt, now);
  if (!at) return null;
  if (at.getTime() < now - PAST_GRACE_MS) return null;
  return at.toISOString();
}

/** Create the queued rows for one registration (the enabled steps it is due) and dispatch them. */
export async function queueRegistrationEmails(registrationId: string, opts: { stepIds?: string[] } = {}) {
  const admin = supabaseAdmin();
  const { data: reg } = await admin.from("registrations").select("id, org_id, room_id, invite_id, waitlisted_at, cancelled_at, invites(starts_at)").eq("id", registrationId).maybeSingle();
  if (!reg) return;
  const loaded = await loadRoomAccess(admin, reg.room_id);
  const kinds = stepKindsFor(reg, loaded?.access.limits ?? { reminders: false });
  if (kinds.length === 0) return;
  const startsAt = (reg.invites as unknown as { starts_at: string | null } | null)?.starts_at ?? null;
  let q = admin.from("invite_emails").select("id, kind, minutes_before, enabled").eq("invite_id", reg.invite_id).eq("enabled", true).in("kind", kinds);
  if (opts.stepIds) q = q.in("id", opts.stepIds);
  const { data: steps } = await q;
  const now = Date.now();
  const rows = (steps ?? [])
    .map((s) => ({ step: s as StepRow, send_at: sendAtFor(s as StepRow, startsAt, now) }))
    .filter((r): r is { step: StepRow; send_at: string } => r.send_at !== null)
    .map((r) => ({ org_id: reg.org_id, registration_id: reg.id, invite_email_id: r.step.id, send_at: r.send_at }));
  if (rows.length > 0) {
    // Existing rows (a re-registration from a second device) keep their state; new steps are added.
    await admin.from("registration_emails").upsert(rows, { onConflict: "registration_id,invite_email_id", ignoreDuplicates: true });
  }
  await dispatch({ registrationId });
}

type Due = RegistrationEmail & {
  registrations: Pick<Registration, "name" | "email" | "code" | "access_token" | "cancelled_at"> | null;
  invite_emails: (Pick<InviteEmail, "kind" | "subject" | "body"> & { invites: (Pick<Invite, "title" | "starts_at" | "timezone"> & { rooms: { name: string } | null }) | null }) | null;
};

/**
 * Hand queued rows to Resend: immediately when due, scheduled when within the horizon,
 * otherwise left for a later run. Returns a small summary for the cron response.
 */
export async function dispatch(filter: { registrationId?: string; stepId?: string } = {}) {
  const summary = { sent: 0, scheduled: 0, failed: 0, skipped: 0 };
  if (!emailConfigured()) return { ...summary, disabled: true };
  const admin = supabaseAdmin();
  const now = Date.now();
  let q = admin
    .from("registration_emails")
    .select("*, registrations(name, email, code, access_token, cancelled_at), invite_emails(kind, subject, body, invites(title, starts_at, timezone, rooms(name)))")
    .eq("status", "queued")
    .lte("send_at", new Date(now + RESEND_SCHEDULE_HORIZON_MS - 60 * 60_000).toISOString())
    .order("send_at")
    .limit(200);
  if (filter.registrationId) q = q.eq("registration_id", filter.registrationId);
  if (filter.stepId) q = q.eq("invite_email_id", filter.stepId);
  const { data } = await q;
  for (const row of (data ?? []) as unknown as Due[]) {
    const reg = row.registrations;
    const step = row.invite_emails;
    const invite = step?.invites;
    if (!reg || !step || !invite) {
      summary.skipped++;
      continue;
    }
    // Opted out since the row was queued: nothing goes to them.
    if (reg.cancelled_at) {
      await admin.from("registration_emails").update({ status: "cancelled" }).eq("id", row.id);
      summary.skipped++;
      continue;
    }
    const vars = templateVars({
      name: reg.name,
      title: invite.title,
      room: invite.rooms?.name ?? "",
      startsAt: invite.starts_at,
      timezone: invite.timezone,
      accessToken: reg.access_token,
      code: reg.code,
      appUrl: publicEnv.appUrl,
    });
    const text = renderTemplate(step.body, vars);
    const subject = renderTemplate(step.subject, vars);
    const dueAt = new Date(row.send_at).getTime();
    const immediate = dueAt <= now + IMMEDIATE_MS;
    try {
      const id = await resend.send({
        to: reg.email,
        subject,
        text,
        html: textToHtml(text, { buttonUrl: vars.link, buttonLabel: step.kind === "confirmation" ? "Save your link" : step.kind === "waitlist" ? "See your place in line" : "Join the webinar" }),
        scheduledAt: immediate ? undefined : row.send_at,
      });
      await admin.from("registration_emails").update({ status: immediate ? "sent" : "scheduled", resend_id: id, error: null }).eq("id", row.id);
      if (immediate) summary.sent++;
      else summary.scheduled++;
    } catch (err) {
      await admin.from("registration_emails").update({ status: "failed", error: (err as Error).message }).eq("id", row.id);
      summary.failed++;
    }
  }
  return summary;
}

/** Cancel whatever Resend still holds for a step and forget those rows (sent ones stay as history). */
export async function cancelStep(stepId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("registration_emails").select("id, status, resend_id").eq("invite_email_id", stepId).in("status", ["queued", "scheduled", "failed"]);
  for (const row of data ?? []) {
    if (row.status === "scheduled" && row.resend_id && emailConfigured()) {
      try {
        await resend.cancel(row.resend_id);
      } catch (err) {
        console.warn("resend cancel failed", row.resend_id, (err as Error).message);
      }
    }
  }
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length > 0) await admin.from("registration_emails").delete().in("id", ids);
}

/**
 * After a step's copy, timing or enabled flag changes: pull back what was scheduled and queue
 * it afresh for every registrant. Confirmation steps are not re-sent; the edit applies to
 * future registrations only.
 */
export async function resyncStep(stepId: string) {
  const admin = supabaseAdmin();
  const { data: step } = await admin.from("invite_emails").select("id, invite_id, kind, enabled").eq("id", stepId).maybeSingle();
  if (!step) return;
  // The welcome and the waiting-list note are sent once at registration; edits apply to future registrants only.
  if (step.kind !== "reminder") return;
  await cancelStep(stepId);
  if (!step.enabled) return;
  const { data: regs } = await admin.from("registrations").select("id").eq("invite_id", step.invite_id);
  for (const r of regs ?? []) await queueRegistrationEmails(r.id, { stepIds: [stepId] });
}

/** After the event's start time changes, every reminder moves. */
export async function resyncInvite(inviteId: string) {
  const admin = supabaseAdmin();
  const { data: steps } = await admin.from("invite_emails").select("id").eq("invite_id", inviteId).eq("kind", "reminder");
  for (const s of steps ?? []) await resyncStep(s.id);
}

/**
 * After a room step is created or edited: copy it to every active event in the room (the
 * database does the insert-or-update) and reschedule each inherited step at Resend against
 * that event's start time.
 */
export async function syncRoomStep(roomStepId: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("sync_room_email", { p_step: roomStepId });
  if (error) throw error;
  const ids = ((data ?? []) as { invite_email_id: string }[]).map((r) => r.invite_email_id);
  for (const id of ids) {
    await resyncStep(id);
    await dispatch({ stepId: id });
  }
  return ids;
}

/** Before a room step is deleted: pull back what Resend holds for every inherited copy. */
export async function cancelRoomStep(roomStepId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("invite_emails").select("id").eq("room_email_id", roomStepId);
  for (const row of data ?? []) await cancelStep(row.id);
}

/** Before a room is deleted: cancel every email still scheduled at Resend for its registrants. */
export async function cancelRoomEmails(roomId: string) {
  if (!emailConfigured()) return;
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("registration_emails")
    .select("id, resend_id, registrations!inner(room_id)")
    .eq("registrations.room_id", roomId)
    .eq("status", "scheduled")
    .not("resend_id", "is", null);
  for (const row of data ?? []) {
    try {
      await resend.cancel(row.resend_id as string);
    } catch (err) {
      console.warn("resend cancel failed", row.resend_id, (err as Error).message);
    }
  }
}

/** The registrant opted out: pull back whatever Resend still holds for them and forget those rows (sent ones stay as history). */
export async function cancelRegistrationEmails(registrationId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("registration_emails").select("id, status, resend_id").eq("registration_id", registrationId).in("status", ["queued", "scheduled", "failed"]);
  for (const row of data ?? []) {
    if (row.status === "scheduled" && row.resend_id && emailConfigured()) {
      try {
        await resend.cancel(row.resend_id);
      } catch (err) {
        console.warn("resend cancel failed", row.resend_id, (err as Error).message);
      }
    }
  }
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length > 0) await admin.from("registration_emails").delete().in("id", ids);
}

/**
 * After a room's plan changes. Reminders are a paid feature: a move to free pulls back every
 * reminder still pending for the room's registrants; a move up queues the reminders for
 * everyone with a seat at an event still ahead (rows already there are kept).
 */
export async function applyPlanToEmails(roomId: string) {
  const admin = supabaseAdmin();
  const loaded = await loadRoomAccess(admin, roomId);
  if (!loaded) return;
  if (!loaded.access.limits.reminders) {
    const { data } = await admin
      .from("registration_emails")
      .select("id, status, resend_id, invite_emails!inner(kind), registrations!inner(room_id)")
      .eq("registrations.room_id", roomId)
      .eq("invite_emails.kind", "reminder")
      .in("status", ["queued", "scheduled", "failed"]);
    for (const row of data ?? []) {
      if (row.status === "scheduled" && row.resend_id && emailConfigured()) {
        try {
          await resend.cancel(row.resend_id);
        } catch (err) {
          console.warn("resend cancel failed", row.resend_id, (err as Error).message);
        }
      }
    }
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length > 0) await admin.from("registration_emails").delete().in("id", ids);
    return;
  }
  const { data: invites } = await admin.from("invites").select("id").eq("room_id", roomId).is("revoked_at", null).gte("starts_at", new Date().toISOString());
  for (const inv of invites ?? []) {
    const { data: regs } = await admin.from("registrations").select("id").eq("invite_id", inv.id).is("waitlisted_at", null).is("cancelled_at", null);
    for (const r of regs ?? []) await queueRegistrationEmails(r.id);
  }
}
