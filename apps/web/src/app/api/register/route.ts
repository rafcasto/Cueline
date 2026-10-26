import { handler, HttpError, json, readJson, requireUser } from "@/lib/auth";
import { loadRoomAccess } from "@/lib/billing";
import { queueRegistrationEmails } from "@/lib/email/schedule";
import { inviteByToken, registrationsFor } from "@/lib/invites";
import { capacityFor, registrationStatus, seatSummary, waitlistPosition } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Registration } from "@/lib/supabase/types";

type Body = { token: string; name: string; email: string };

/**
 * Register for a webinar through an invite link. The caller is the attendee's anonymous
 * identity (created client-side before submitting), which is what the room later recognises.
 * The database seats the registrant while the event has seats left and puts them on the
 * waiting list otherwise, under a lock so the last seat is never given twice; registering the
 * same email again re-binds it to the current identity (a second device) without taking a
 * second seat, and someone who opted out rejoins like a newcomer. Registration also queues the
 * emails due: the welcome and (on a paid plan) the reminders for a seat, the waiting-list note
 * otherwise.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (name.length < 1 || name.length > 60) throw new HttpError(400, "Enter your name (up to 60 characters).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");

  const found = await inviteByToken(String(body.token ?? ""));
  if (!found) throw new HttpError(404, "This invite link is not valid.");
  const { invite, room, session } = found;
  if (invite.revoked_at) throw new HttpError(410, "This invite link is no longer active.");

  const admin = supabaseAdmin();
  const loaded = await loadRoomAccess(admin, invite.room_id);
  if (!loaded) throw new HttpError(404, "This invite link is not valid.");
  const capacity = capacityFor(invite, loaded.access.limits);

  const { data, error } = await admin
    .rpc("register_attendee", { p_invite: invite.id, p_user: user.id, p_name: name, p_email: email, p_capacity: capacity })
    .select("*")
    .single();
  if (error) throw error;
  const registration = data as Registration;

  // Email problems must never block the registration itself.
  try {
    await queueRegistrationEmails(registration.id);
  } catch (err) {
    console.error("email sequence", err);
  }

  const rows = await registrationsFor(invite.id);
  const status = registrationStatus(registration);
  return json({
    registration: { id: registration.id, name: registration.name, email: registration.email, code: registration.code, access_token: registration.access_token, created_at: registration.created_at },
    status,
    position: waitlistPosition(rows, registration.id),
    seats: seatSummary(rows, capacity),
    room_slug: room.slug,
    session_state: session?.state ?? null,
  });
});
