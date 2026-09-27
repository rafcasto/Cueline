import { notFound, redirect } from "next/navigation";
import { HostPanel } from "@/components/HostPanel";
import { supabaseServer } from "@/lib/supabase/server";
import type { DeckSlide, Room, Session } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function HostRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect(`/login?next=/host/${slug}`);

  // RLS: rooms are readable by anyone, but org_members is not, so this is the membership check.
  const { data: room } = await sb.from("rooms").select("*").eq("slug", slug).maybeSingle();
  if (!room) notFound();
  const { data: member } = await sb.from("org_members").select("role").eq("org_id", room.org_id).eq("user_id", auth.user.id).maybeSingle();
  if (!member) redirect("/host?error=not-a-member");

  const { data: session } = await sb.from("sessions").select("*").eq("room_id", room.id).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const presentationId = session?.presentation_id as string | null | undefined;
  const { data: slides } = presentationId
    ? await sb.from("deck_slides").select("*").eq("presentation_id", presentationId).order("index")
    : await sb.from("deck_slides").select("*").eq("org_id", room.org_id).order("synced_at", { ascending: false }).order("index").limit(200);

  // Without a live session, show the most recently synced deck only.
  const list = (slides as DeckSlide[] | null) ?? [];
  const latestDeck = presentationId ?? list[0]?.presentation_id;
  return (
    <HostPanel
      room={room as Room}
      initialSession={(session as Session | null) ?? null}
      userId={auth.user.id}
      slides={list.filter((s) => s.presentation_id === latestDeck).sort((a, b) => a.index - b.index)}
    />
  );
}
