import { handler, HttpError, json, readJson, requirePlatformAdmin, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteSessionRecording } from "@/lib/video";

/**
 * Platform admins only: delete a session's recording now rather than at the end of its
 * retention. Removes the MP4 and the HLS files from the bucket and marks the session the same
 * way the nightly sweep does, so it drops off the host's Recordings tab and this list.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  await requirePlatformAdmin(user.id);
  const body = await readJson<{ session_id?: unknown }>(req);
  const id = typeof body.session_id === "string" ? body.session_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "session_id must be a session id");

  const admin = supabaseAdmin();
  const { data: session } = await admin.from("sessions").select("id, state, recording_url, recording_deleted_at").eq("id", id).maybeSingle();
  if (!session || !session.recording_url) throw new HttpError(404, "no recording for that session");
  if (session.state !== "ended") throw new HttpError(409, "the session is still open; end it first");
  if (session.recording_deleted_at) return json({ ok: true, objects: 0, already: true });

  const objects = await deleteSessionRecording(session.id);
  const { error } = await admin.from("sessions").update({ recording_deleted_at: new Date().toISOString(), hls_url: null }).eq("id", session.id);
  if (error) throw error;
  return json({ ok: true, objects });
});
