import { notFound, redirect } from "next/navigation";
import { HostPanel } from "@/components/HostPanel";
import { effectivePlan } from "@/lib/billing";
import { planLimits } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import type { Activity, Invite, Presentation, Registration, Room, Session } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function HostRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect(`/login?next=/host/${slug}`);

  const { data: room } = await sb.from("rooms").select("*").eq("slug", slug).maybeSingle();
  if (!room) notFound();
  const { data: member } = await sb.from("org_members").select("role").eq("org_id", room.org_id).eq("user_id", auth.user.id).maybeSingle();
  if (!member) redirect("/host?error=not-a-member");

  const [{ data: session }, { data: presentations }, { data: activities }, { data: invites }, { data: registrations }, { data: org }] = await Promise.all([
    sb.from("sessions").select("*").eq("room_id", room.id).neq("state", "ended").maybeSingle(),
    sb.from("presentations").select("*").eq("room_id", room.id).order("created_at", { ascending: false }),
    sb.from("activities").select("*").eq("room_id", room.id).order("sort_order").order("created_at"),
    sb.from("invites").select("*").eq("room_id", room.id).order("created_at", { ascending: false }),
    sb.from("registrations").select("*").eq("room_id", room.id).order("created_at", { ascending: false }),
    sb.from("organisations").select("id, plan, plan_status").eq("id", room.org_id).maybeSingle(),
  ]);
  // What the plan allows, for the seat cap on events and the reminder gate on the Emails tab.
  const plan = effectivePlan(org ?? { id: room.org_id, plan: "free" });

  return (
    <HostPanel
      room={room as Room}
      initialSession={(session as Session | null) ?? null}
      userId={auth.user.id}
      userEmail={auth.user.email ?? null}
      presentations={(presentations as Presentation[] | null) ?? []}
      activities={(activities as Activity[] | null) ?? []}
      invites={(invites as Invite[] | null) ?? []}
      registrations={(registrations as Registration[] | null) ?? []}
      plan={plan}
      limits={planLimits(plan)}
    />
  );
}
