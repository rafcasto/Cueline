import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { decideGoLive, endsBy, loadRoomAccess, loadUsage } from "@/lib/billing";
import { sweepOverdue } from "@/lib/session-lifecycle";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureRoom, startSessionEgress } from "@/lib/video";

type Body = { session_id: string };

/**
 * Waiting -> live. The room's plan is checked here: not locked, sessions left this month, the
 * participant cap set on the LiveKit room, recording only where the plan includes it, and the
 * hard stop stamped on the session. A session counts the moment it goes live.
 */
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

  const loaded = await loadRoomAccess(admin, session.room_id);
  if (!loaded) return json({ error: "room not found" }, { status: 404 });
  await sweepOverdue(admin, session.org_id);
  const decision = decideGoLive(await loadUsage(admin, loaded));
  if (!decision.allowed) return json({ error: decision.reason, code: "plan_limit" }, { status: 402 });
  const limits = decision.limits;

  // Presenters and promoted attendees sit on top of the audience cap.
  await ensureRoom(room, limits.participants + 10);
  const out = limits.recording ? await startSessionEgress(room, session.id) : null;
  const started = new Date();
  const { error } = await admin
    .from("sessions")
    .update({
      state: "live",
      started_at: started.toISOString(),
      hls_url: out?.hlsUrl ?? null,
      egress_id: out?.egressId ?? null,
      recording_url: out?.recordingUrl ?? null,
      counted: true,
      max_participants: limits.participants,
      ends_by: endsBy(started, limits).toISOString(),
    })
    .eq("id", session.id);
  if (error) throw error;
  return json({ ok: true, hls_url: out?.hlsUrl ?? null, ends_by: endsBy(started, limits).toISOString(), recording: limits.recording });
});
