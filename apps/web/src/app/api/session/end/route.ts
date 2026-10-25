import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { endSession } from "@/lib/session-lifecycle";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { session_id: string };

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin.from("sessions").select("*").eq("id", body.session_id).maybeSingle();
  if (!session) return json({ error: "session not found" }, { status: 404 });
  await requireOrgRole(user.id, session.org_id, ["owner", "host"]);
  if (session.state === "ended") return json({ ok: true, already_ended: true });

  const { counted } = await endSession(admin, session);
  return json({ ok: true, counted });
});
