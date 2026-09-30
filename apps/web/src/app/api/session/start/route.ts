import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { room_slug: string; presentation_id?: string | null };

/** Open the room: a session in `waiting` state. Participants see the waiting room until go-live. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: room } = await admin.from("rooms").select("*").eq("slug", body.room_slug).maybeSingle();
  if (!room) return json({ error: "room not found" }, { status: 404 });
  await requireOrgRole(user.id, room.org_id, ["owner", "host"]);

  const { data: open } = await admin.from("sessions").select("id").eq("room_id", room.id).neq("state", "ended").maybeSingle();
  if (open) return json({ session_id: open.id, already_open: true });

  const { data: session, error } = await admin
    .from("sessions")
    .insert({ org_id: room.org_id, room_id: room.id, presentation_id: body.presentation_id ?? null, state: "waiting" })
    .select("id")
    .single();
  if (error) throw error;
  return json({ session_id: session.id });
});
