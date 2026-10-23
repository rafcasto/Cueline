import { notFound, redirect } from "next/navigation";
import { PublicShell } from "@/components/AppShell";
import { ViewerRoom } from "@/components/ViewerRoom";
import { WaitingRoom } from "@/components/WaitingRoom";
import { ButtonLink, Card } from "@/components/ui";
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
      <PublicShell>
        <div className="mx-auto max-w-3xl">
          <WaitingRoom config={(room as Room).waiting_room} />
          <Card className="mx-auto -mt-8 max-w-xl p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{(room as Room).name}</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">Registration is by invite only</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              This webinar has no open invite link right now. Already registered? Use the link from your email, or your email and code.
            </p>
            <ButtonLink href="/join" variant="secondary" className="mt-6">
              Join with email and code
            </ButtonLink>
          </Card>
        </div>
      </PublicShell>
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
