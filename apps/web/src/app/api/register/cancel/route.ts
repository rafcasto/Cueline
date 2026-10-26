import { handler, HttpError, json, readJson, requireUser } from "@/lib/auth";
import { loadOrgPlan } from "@/lib/billing";
import { cancelRegistrationEmails } from "@/lib/email/schedule";
import { inviteByToken } from "@/lib/invites";
import { promoteWaitlist } from "@/lib/seats-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Invite, Registration } from "@/lib/supabase/types";

type Body = { token?: string; invite?: string };

/**
 * Opt out of an event: from the cancel link in every email (the registration's own access
 * token) or from the event page (the invite token plus the caller's identity). The seat is
 * freed, the registrant's pending emails are pulled back, and the first person on the waiting
 * list takes the seat. Registering again on the invite link puts them back in the queue.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  let reg: Registration | null = null;
  if (body.token) {
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(body.token)) throw new HttpError(404, "This link is not valid.");
    const { data } = await admin.from("registrations").select("*").eq("access_token", body.token).maybeSingle();
    reg = (data as Registration | null) ?? null;
  } else if (body.invite) {
    const found = await inviteByToken(body.invite);
    if (!found) throw new HttpError(404, "This invite link is not valid.");
    const { data } = await admin.from("registrations").select("*").eq("invite_id", found.invite.id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    reg = (data as Registration | null) ?? null;
  }
  if (!reg) throw new HttpError(404, "We could not find that registration.");

  const { data: invite } = await admin.from("invites").select("*").eq("id", reg.invite_id).maybeSingle();
  if (!invite) throw new HttpError(404, "The event is gone.");
  const { data: room } = await admin.from("rooms").select("slug").eq("id", reg.room_id).maybeSingle();

  if (!reg.cancelled_at) {
    const { error } = await admin.from("registrations").update({ cancelled_at: new Date().toISOString() }).eq("id", reg.id);
    if (error) throw error;
    try {
      await cancelRegistrationEmails(reg.id);
    } catch (err) {
      console.error("cancel emails", err);
    }
    const planned = await loadOrgPlan(admin, reg.org_id);
    if (planned) {
      try {
        await promoteWaitlist(admin, invite as Invite, planned.limits);
      } catch (err) {
        console.error("waitlist after opt-out", err);
      }
    }
  }
  return json({ ok: true, name: reg.name, title: (invite as Invite).title, invite_token: (invite as Invite).token, room_slug: room?.slug ?? null });
});
