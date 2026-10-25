import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mintRoomToken } from "@/lib/video";

type Body = { session_id: string; role: "presenter" | "viewer" };

/**
 * Everyone joins the room over WebRTC. Viewers (any signed-in user, the anonymous
 * audience included) get a subscribe-only token plus the HLS playlist to fall back on
 * when the room cannot take them. Presenters, who must be org members, get a publish
 * token. Promoted viewers get theirs from /api/stage.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin
    .from("sessions")
    .select("id, org_id, hls_url, state, max_participants, ends_by, rooms(livekit_room)")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session || session.state === "ended") return json({ error: "no open session" }, { status: 404 });
  const room = (session.rooms as unknown as { livekit_room: string } | null)?.livekit_room;
  if (!room) return json({ error: "room missing" }, { status: 500 });

  if (body.role === "viewer") {
    if (session.ends_by && new Date(session.ends_by) < new Date()) return json({ error: "this session has reached its time limit" }, { status: 410 });
    const { data: seat } = await admin.from("participants").select("display_name, joined_at").eq("session_id", session.id).eq("user_id", user.id).maybeSingle();
    // The plan's audience cap, in order of arrival: the first N seats get in, later ones are told
    // the room is full. LiveKit's own maxParticipants backs this up for anyone who skips the API.
    if (session.max_participants) {
      const q = admin.from("participants").select("user_id", { count: "exact", head: true }).eq("session_id", session.id);
      const { count } = seat ? await q.lte("joined_at", seat.joined_at) : await q;
      const rank = (count ?? 0) + (seat ? 0 : 1);
      if (rank > session.max_participants) {
        return json({ error: `This session is full (${session.max_participants} attendees on the host's plan).`, code: "room_full" }, { status: 403 });
      }
    }
    // LiveKit allows one connection per identity per room and disconnects the older one when a
    // duplicate joins. The audience connection therefore never shares the user's identity, or a
    // host previewing the attendee page in a second tab would kick their own camera out of the
    // room (and the retry would kick the preview, and so on). Fresh suffix per token: two tabs
    // of the same attendee coexist, and the publish connection (identity = user id) is untouched.
    const identity = `${user.id}:v:${crypto.randomUUID().slice(0, 8)}`;
    const t = await mintRoomToken({ room, identity, name: seat?.display_name ?? "Participant", role: "viewer" });
    return json({ mode: "webrtc", ...t, hls_url: session.hls_url });
  }

  await requireOrgRole(user.id, session.org_id);
  const t = await mintRoomToken({
    room,
    identity: user.id,
    name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Presenter",
    role: "presenter",
  });
  return json({ mode: "webrtc", ...t });
});
