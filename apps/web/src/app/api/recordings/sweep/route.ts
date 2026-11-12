import { deleteSessionRecording } from "@/lib/video";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Nightly, from the Vercel cron in vercel.json: delete the files of every recording past its
 * plan's retention (recording_expires_at, stamped at go-live) and mark the session. A session
 * whose files cannot be removed stays for the next run; the error is in the response and the
 * function log. `?dry=1` lists what would go without touching anything.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorised" }, { status: 401 });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";

  const admin = supabaseAdmin();
  const now = new Date();
  const { data, error } = await admin
    .from("sessions")
    .select("id, recording_expires_at")
    .eq("state", "ended")
    .not("recording_url", "is", null)
    .is("recording_deleted_at", null)
    .lt("recording_expires_at", now.toISOString())
    .order("recording_expires_at")
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const deleted: { id: string; objects: number }[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const s of data ?? []) {
    try {
      const objects = await deleteSessionRecording(s.id, { dryRun });
      if (!dryRun) {
        const { error: mark } = await admin.from("sessions").update({ recording_deleted_at: now.toISOString(), hls_url: null }).eq("id", s.id);
        if (mark) throw mark;
      }
      deleted.push({ id: s.id, objects });
    } catch (err) {
      console.error("recording sweep", s.id, err);
      failed.push({ id: s.id, error: (err as Error).message });
    }
  }
  return Response.json({ dryRun, expired: (data ?? []).length, deleted, failed });
}
