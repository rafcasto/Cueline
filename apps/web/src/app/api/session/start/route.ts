import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { startHlsEgress, startRecordingEgress } from "@/lib/video";

type Body = { room_slug: string; presentation_id?: string | null };

/** Start one live run of a room: sessions row, HLS egress and recording. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: room } = await admin.from("rooms").select("*").eq("slug", body.room_slug).maybeSingle();
  if (!room) return json({ error: "room not found" }, { status: 404 });
  await requireOrgRole(user.id, room.org_id, ["owner", "host"]);

  const { data: live } = await admin.from("sessions").select("id").eq("room_id", room.id).is("ended_at", null).maybeSingle();
  if (live) return json({ error: "session already live", session_id: live.id }, { status: 409 });

  const { data: session, error } = await admin
    .from("sessions")
    .insert({ org_id: room.org_id, room_id: room.id, presentation_id: body.presentation_id ?? null })
    .select("*")
    .single();
  if (error) throw error;

  // Egress starts once a presenter publishes; kicking it off now means the playlist exists when viewers arrive.
  const [hls, rec] = await Promise.all([
    startHlsEgress(room.livekit_room, session.id),
    startRecordingEgress(room.livekit_room, session.id),
  ]);
  await admin
    .from("sessions")
    .update({ hls_url: hls.hlsUrl, egress_id: `${hls.egressId},${rec.egressId}`, recording_url: rec.recordingUrl })
    .eq("id", session.id);

  return json({ session_id: session.id, hls_url: hls.hlsUrl });
});
