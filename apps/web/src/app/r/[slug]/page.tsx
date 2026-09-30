import { notFound } from "next/navigation";
import { ViewerRoom } from "@/components/ViewerRoom";
import { supabaseServer } from "@/lib/supabase/server";
import type { Presentation, Room, Session } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await supabaseServer();
  const { data: room } = await sb.from("rooms").select("*").eq("slug", slug).maybeSingle();
  if (!room) notFound();
  const { data: session } = await sb.from("sessions").select("*").eq("room_id", room.id).neq("state", "ended").maybeSingle();
  // Presentations are readable only by authenticated users; the anonymous sign-in happens client-side,
  // so the deck is loaded here with the cookie if present and otherwise resolved in the client.
  const { data: presentation } = session?.presentation_id
    ? await sb.from("presentations").select("*").eq("id", session.presentation_id).maybeSingle()
    : { data: null };
  return <ViewerRoom room={room as Room} session={(session as Session | null) ?? null} presentation={(presentation as Presentation | null) ?? null} />;
}
