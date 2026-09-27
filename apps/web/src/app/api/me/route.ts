import { handler, json, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Extension popup: "Connected as X · Room Y · Live". Also used by the host panel header. */
export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  const admin = supabaseAdmin();
  const { data: memberships } = await admin
    .from("org_members")
    .select("org_id, role, organisations(name)")
    .eq("user_id", user.id);
  const orgIds = (memberships ?? []).map((m) => m.org_id);
  const { data: live } = orgIds.length
    ? await admin
        .from("sessions")
        .select("id, presentation_id, started_at, rooms(slug, name)")
        .in("org_id", orgIds)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
    : { data: [] };

  return json({
    user: { id: user.id, email: user.email, name: user.user_metadata?.full_name ?? null },
    orgs: (memberships ?? []).map((m) => ({
      id: m.org_id,
      role: m.role,
      name: (m.organisations as unknown as { name: string } | null)?.name ?? "",
    })),
    live_sessions: (live ?? []).map((s) => ({
      id: s.id,
      presentation_id: s.presentation_id,
      started_at: s.started_at,
      room: s.rooms as unknown as { slug: string; name: string } | null,
    })),
  });
});
