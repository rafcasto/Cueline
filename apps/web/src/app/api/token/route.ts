import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mintRoomToken } from "@/lib/video";

type Body = { session_id: string; role: "presenter" | "viewer" };

/**
 * Viewers get the HLS playlist (no WebRTC socket). Presenters, who must be org
 * members, get a publish token. Promoted viewers get theirs from /api/stage.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin
    .from("sessions")
    .select("id, org_id, hls_url, ended_at, rooms(livekit_room)")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session || session.ended_at) return json({ error: "no live session" }, { status: 404 });

  if (body.role === "viewer") return json({ mode: "hls", hls_url: session.hls_url });

  await requireOrgRole(user.id, session.org_id);
  const room = (session.rooms as unknown as { livekit_room: string } | null)?.livekit_room;
  if (!room) return json({ error: "room missing" }, { status: 500 });
  const t = await mintRoomToken({
    room,
    identity: user.id,
    name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Presenter",
    role: "presenter",
  });
  return json({ mode: "webrtc", ...t });
});
