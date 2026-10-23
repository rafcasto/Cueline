import { handler, HttpError, json, readJson, requireUser } from "@/lib/auth";
import { inviteByToken } from "@/lib/invites";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { token: string; name: string; email: string };

/**
 * Register for a webinar through an invite link. The caller is the attendee's anonymous
 * identity (created client-side before submitting), which is what the room later recognises.
 * Registering the same email twice on one invite re-binds it to the current identity, so an
 * attendee who comes back on another device can get in again.
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

  const { data, error } = await supabaseAdmin()
    .from("registrations")
    .upsert(
      { org_id: invite.org_id, room_id: invite.room_id, invite_id: invite.id, user_id: user.id, name, email },
      { onConflict: "invite_id,email" },
    )
    .select("id, name, email, created_at")
    .single();
  if (error) throw error;

  return json({ registration: data, room_slug: room.slug, session_state: session?.state ?? null });
});
