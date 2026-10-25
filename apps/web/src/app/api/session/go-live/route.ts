import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureRoom, startSessionEgress } from "@/lib/video";

type Body = { session_id: string };

/** Waiting -> live: start the one egress (recording + HLS fallback), stamp started_at. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin.from("sessions").select("*, rooms(livekit_room)").eq("id", body.session_id).maybeSingle();
  if (!session) return json({ error: "session not found" }, { status: 404 });
  await requireOrgRole(user.id, session.org_id, ["owner", "host"]);
  if (session.state === "live") return json({ ok: true, already_live: true });
  if (session.state === "ended") return json({ error: "session has ended" }, { status: 409 });

  const room = (session.rooms as unknown as { livekit_room: string } | null)?.livekit_room ?? "";
  if (!room) return json({ error: "room missing" }, { status: 500 });
  await ensureRoom(room);
  const out = await startSessionEgress(room, session.id);
  const { error } = await admin
    .from("sessions")
    .update({
      state: "live",
      started_at: new Date().toISOString(),
      hls_url: out.hlsUrl,
      egress_id: out.egressId,
      recording_url: out.recordingUrl,
    })
    .eq("id", session.id);
  if (error) throw error;
  return json({ ok: true, hls_url: out.hlsUrl });
});
