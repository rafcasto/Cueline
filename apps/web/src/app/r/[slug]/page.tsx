import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ViewerRoom } from "@/components/ViewerRoom";
import { WaitingRoom } from "@/components/WaitingRoom";
import { activeInvite, registrationFor } from "@/lib/invites";
import { supabaseServer } from "@/lib/supabase/server";
import type { Presentation, Room, Session } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * The room is behind registration. A visitor who has not registered is sent to the room's
 * current invite link; org members walk straight in so hosts can check their own room.
 */
export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await supabaseServer();
  const { data: room } = await sb.from("rooms").select("*").eq("slug", slug).maybeSingle();
  if (!room) notFound();

  const { data: auth } = await sb.auth.getUser();
  let attendee: { name: string } | null = null;
  if (auth.user) {
    const { data: member } = await sb.from("org_members").select("role").eq("org_id", room.org_id).eq("user_id", auth.user.id).maybeSingle();
    if (member) attendee = { name: auth.user.email?.split("@")[0] ?? "Host" };
    else {
      const registration = await registrationFor(room.id, auth.user.id);
      if (registration) attendee = { name: registration.name };
    }
  }
  if (!attendee) {
    const invite = await activeInvite(room.id);
    if (invite) redirect(`/join/${invite.token}`);
    return (
      <main className="mx-auto max-w-4xl p-4">
        <h1 className="text-xl font-semibold">{(room as Room).name}</h1>
        <WaitingRoom config={(room as Room).waiting_room} className="mt-3">
          <p className="absolute bottom-3 right-3 rounded bg-black/50 px-2 py-1 text-xs">Registration is by invite link only.</p>
        </WaitingRoom>
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
          This webinar does not have an open invite link. Ask the organiser for theirs, or <Link href="/login" className="underline">sign in as a host</Link>.
        </p>
      </main>
    );
  }

  const { data: session } = await sb.from("sessions").select("*").eq("room_id", room.id).neq("state", "ended").maybeSingle();
  // Presentations are readable only by authenticated users; the anonymous sign-in happens client-side,
  // so the deck is loaded here with the cookie if present and otherwise resolved in the client.
  const { data: presentation } = session?.presentation_id
    ? await sb.from("presentations").select("*").eq("id", session.presentation_id).maybeSingle()
    : { data: null };
  return (
    <ViewerRoom
      room={room as Room}
      session={(session as Session | null) ?? null}
      presentation={(presentation as Presentation | null) ?? null}
      attendee={attendee}
    />
  );
}
