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

/**
 * This identity's registration for a room, if any. With `inviteId` it is the registration for
 * that event in whatever state (seated, waiting or opted out), for the event page to describe;
 * with `seatedOnly` it is one that holds a seat, which is what the room's door checks.
 */
export async function registrationFor(roomId: string, userId: string, opts: { inviteId?: string; seatedOnly?: boolean } = {}): Promise<Registration | null> {
  let q = supabaseAdmin().from("registrations").select("*").eq("room_id", roomId).eq("user_id", userId);
  if (opts.inviteId) q = q.eq("invite_id", opts.inviteId);
  if (opts.seatedOnly) q = q.is("waitlisted_at", null).is("cancelled_at", null);
  const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Registration | null) ?? null;
}

/** Every registration for an event, the rows the seat count and the queue are computed from. */
export async function registrationsFor(inviteId: string): Promise<Registration[]> {
  const { data } = await supabaseAdmin().from("registrations").select("*").eq("invite_id", inviteId).order("created_at");
  return (data as Registration[] | null) ?? [];
}
