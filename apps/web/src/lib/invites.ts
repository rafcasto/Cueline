import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Invite, Registration, Room, Session } from "@/lib/supabase/types";

/**
 * Server-side invite lookups. Invites are not readable by viewers under RLS (the token is the
 * secret), so pages resolve a token with the service client and hand the client only what it
 * needs to render.
 */
export async function inviteByToken(token: string): Promise<{ invite: Invite; room: Room; session: Session | null } | null> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const admin = supabaseAdmin();
  const { data: invite } = await admin.from("invites").select("*").eq("token", token).maybeSingle();
  if (!invite) return null;
  const [{ data: room }, { data: session }] = await Promise.all([
    admin.from("rooms").select("*").eq("id", invite.room_id).single(),
    admin.from("sessions").select("*").eq("room_id", invite.room_id).neq("state", "ended").maybeSingle(),
  ]);
  return { invite: invite as Invite, room: room as Room, session: (session as Session | null) ?? null };
}

/** The newest live invite for a room; where an unregistered visitor to /r/<slug> is sent. */
export async function activeInvite(roomId: string): Promise<Invite | null> {
  const { data } = await supabaseAdmin()
    .from("invites")
    .select("*")
    .eq("room_id", roomId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Invite | null) ?? null;
}

/** This identity's registration for a room, if any. */
export async function registrationFor(roomId: string, userId: string): Promise<Registration | null> {
  const { data } = await supabaseAdmin()
    .from("registrations")
    .select("*")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Registration | null) ?? null;
}
