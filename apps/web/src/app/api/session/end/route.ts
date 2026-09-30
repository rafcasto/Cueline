import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stopEgress } from "@/lib/video";

type Body = { session_id: string };

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin.from("sessions").select("*").eq("id", body.session_id).maybeSingle();
  if (!session) return json({ error: "session not found" }, { status: 404 });
  await requireOrgRole(user.id, session.org_id, ["owner", "host"]);
  if (session.state === "ended") return json({ ok: true, already_ended: true });

  for (const id of String(session.egress_id ?? "").split(",").filter(Boolean)) await stopEgress(id);
  await admin.from("sessions").update({ state: "ended", ended_at: new Date().toISOString() }).eq("id", session.id);
  return json({ ok: true });
});
