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
    .select("id, org_id, hls_url, state, rooms(livekit_room)")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session || session.state === "ended") return json({ error: "no open session" }, { status: 404 });
  const room = (session.rooms as unknown as { livekit_room: string } | null)?.livekit_room;
  if (!room) return json({ error: "room missing" }, { status: 500 });

  if (body.role === "viewer") {
    const { data: seat } = await admin.from("participants").select("display_name").eq("session_id", session.id).eq("user_id", user.id).maybeSingle();
    const t = await mintRoomToken({ room, identity: user.id, name: seat?.display_name ?? "Participant", role: "viewer" });
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
