import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkPublicBase, ensureRoom, startHlsEgress, startRecordingEgress } from "@/lib/video";

type Body = { session_id: string };

/** Waiting -> live: start the HLS egress and the recording, stamp started_at. */
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
  // Fail here, in the host's panel, rather than in every participant's player.
  await checkPublicBase().catch((err: Error) => {
    throw new HttpError(500, err.message);
  });
  await ensureRoom(room);
  const [hls, rec] = await Promise.all([startHlsEgress(room, session.id), startRecordingEgress(room, session.id)]);
  const { error } = await admin
    .from("sessions")
    .update({
      state: "live",
      started_at: new Date().toISOString(),
      hls_url: hls.hlsUrl,
      egress_id: `${hls.egressId},${rec.egressId}`,
      recording_url: rec.recordingUrl,
    })
    .eq("id", session.id);
  if (error) throw error;
  return json({ ok: true, hls_url: hls.hlsUrl });
});
