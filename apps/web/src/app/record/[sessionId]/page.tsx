import { notFound } from "next/navigation";
import { RecorderStage } from "@/components/RecorderStage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Presentation, Room, Session } from "@/lib/supabase/types";
import { verifyRecordKey } from "@/lib/video";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recording", robots: { index: false, follow: false } };

/**
 * The page the egress browser films (see startSessionEgress in lib/video). It carries no
 * cookie, so the session's record key in the URL is what lets it in; anyone else gets a 404.
 * The session row is read with the service client for the same reason; the client component
 * then signs in anonymously for the live state, as attendees do.
 */
export default async function RecordPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ key?: string }> }) {
  const [{ sessionId }, { key }] = await Promise.all([params, searchParams]);
  if (!verifyRecordKey(sessionId, key)) notFound();

  const admin = supabaseAdmin();
  const { data: session } = await admin.from("sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) notFound();
  const [{ data: room }, { data: presentation }] = await Promise.all([
    admin.from("rooms").select("*").eq("id", session.room_id).maybeSingle(),
    session.presentation_id ? admin.from("presentations").select("*").eq("id", session.presentation_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!room) notFound();

  return <RecorderStage room={room as Room} session={session as Session} presentation={(presentation as Presentation | null) ?? null} recordKey={key!} />;
}
