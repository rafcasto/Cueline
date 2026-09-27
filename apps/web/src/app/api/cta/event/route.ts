import { handler, json, readJson, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CtaAction } from "@/lib/supabase/types";

type Body = { cta_id: string; session_id: string; slide_id?: string | null; action: CtaAction };

/**
 * Own the conversion data: log a row on view and on tap, before any checkout
 * loads, so abandonment is captured. offset_seconds is computed server-side.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin.from("sessions").select("id, org_id, started_at").eq("id", body.session_id).maybeSingle();
  if (!session) return json({ error: "session not found" }, { status: 404 });
  const offset = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));

  const { data, error } = await admin
    .from("cta_events")
    .insert({
      org_id: session.org_id,
      session_id: session.id,
      cta_id: body.cta_id,
      user_id: user.id,
      slide_id: body.slide_id ?? null,
      offset_seconds: offset,
      action: body.action,
    })
    .select("id")
    .single();
  if (error) throw error;
  return json({ cta_event_id: data.id });
});
