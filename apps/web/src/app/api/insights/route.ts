import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { loadRoomAccess } from "@/lib/billing";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SessionEngagement } from "@/lib/supabase/types";

type Body = { session_id: string };

/**
 * The scored audience of one session: every row of `session_engagement` for it. The view is
 * not readable by the API roles (migration 20261124090000), so this is the only way to it and
 * the plan is checked here: a room without insights gets a 402 with `plan_limit`, the code the
 * host panel shows as the gate it is.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin.from("sessions").select("id, org_id, room_id").eq("id", String(body.session_id ?? "")).maybeSingle();
  if (!session) return json({ error: "session not found" }, { status: 404 });
  await requireOrgRole(user.id, session.org_id);

  const loaded = await loadRoomAccess(admin, session.room_id);
  if (!loaded) return json({ error: "room not found" }, { status: 404 });
  if (!loaded.access.limits.insights) return json({ error: `Audience insights are not included on ${loaded.access.limits.label}.`, code: "plan_limit" }, { status: 402 });

  const { data, error } = await admin.from("session_engagement").select("*").eq("session_id", session.id);
  if (error) throw error;
  return json({ rows: (data ?? []) as SessionEngagement[] });
});
