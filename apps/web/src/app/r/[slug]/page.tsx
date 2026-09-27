import { notFound } from "next/navigation";
import { ViewerRoom } from "@/components/ViewerRoom";
import { supabaseServer } from "@/lib/supabase/server";
import type { Room, Session } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await supabaseServer();
  const { data: room } = await sb.from("rooms").select("*").eq("slug", slug).maybeSingle();
  if (!room) notFound();
  const { data: session } = await sb.from("sessions").select("*").eq("room_id", room.id).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return <ViewerRoom room={room as Room} session={(session as Session | null) ?? null} />;
}
