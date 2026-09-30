import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mintRoomToken, removeFromRoom } from "@/lib/video";

type Body =
  | { action: "invite" | "confirm" | "revoke"; session_id: string; user_id: string }
  | { action: "token"; session_id: string };

/**
 * Promote-to-stage.
 *   invite  (host)   -> roster state `invited`; the viewer pre-warms (token + permission prompt)
 *   confirm (host)   -> roster state `live`; viewer tears down HLS and publishes
 *   revoke  (host)   -> roster state `revoked` FIRST, then the vendor call; Supabase is the source of truth
 *   token   (viewer) -> publish token, only while invited or live
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin
    .from("sessions")
    .select("id, org_id, state, rooms(livekit_room)")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session || session.state === "ended") return json({ error: "no open session" }, { status: 404 });
  const room = (session.rooms as unknown as { livekit_room: string } | null)?.livekit_room ?? "";

  if (body.action === "token") {
    const { data: roster } = await admin
      .from("stage_roster")
      .select("state")
      .eq("session_id", session.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!roster || !["invited", "live"].includes(roster.state)) throw new HttpError(403, "not on the stage roster");
    const t = await mintRoomToken({ room, identity: user.id, name: "Guest", role: "presenter", ttlSeconds: 60 * 30 });
    return json({ mode: "webrtc", ...t });
  }

  await requireOrgRole(user.id, session.org_id, ["owner", "host"]);
  const state = body.action === "invite" ? "invited" : body.action === "confirm" ? "live" : "revoked";
  const { error } = await admin.from("stage_roster").upsert(
    { org_id: session.org_id, session_id: session.id, user_id: body.user_id, state, updated_at: new Date().toISOString() },
    { onConflict: "session_id,user_id" },
  );
  if (error) throw error;

  if (body.action === "revoke") await removeFromRoom(room, body.user_id);
  return json({ ok: true, state });
});
