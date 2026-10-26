import { notFound } from "next/navigation";
import { PublicShell } from "@/components/AppShell";
import { RegisterForm } from "@/components/RegisterForm";
import { loadRoomAccess } from "@/lib/billing";
import { inviteByToken, registrationFor, registrationsFor } from "@/lib/invites";
import { capacityFor, registrationStatus, seatSummary, waitlistPosition } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await inviteByToken(token);
  return { title: found ? found.invite.title : "Invite" };
}

/**
 * The invite link. One page does the whole attendee side: what the webinar is, when it is,
 * how many seats are left, a two-field registration (or the waiting list once the seats are
 * gone), and the door into the room once registered.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await inviteByToken(token);
  if (!found) notFound();
  const { invite, room, session } = found;

  // A returning attendee already has an identity cookie from the first visit; skip the form for them.
  const sb = await supabaseServer();
  const [{ data: auth }, loaded, rows] = await Promise.all([sb.auth.getUser(), loadRoomAccess(supabaseAdmin(), room.id), registrationsFor(invite.id)]);
  const registration = auth.user ? await registrationFor(room.id, auth.user.id, { inviteId: invite.id }) : null;
  const capacity = capacityFor(invite, loaded?.access.limits ?? { participants: 10 });

  return (
    <PublicShell>
      <RegisterForm
        token={invite.token}
        title={invite.title}
        description={invite.description}
        startsAt={invite.starts_at}
        revoked={!!invite.revoked_at}
        roomName={room.name}
        roomSlug={room.slug}
        waitingRoom={room.waiting_room}
        branding={room.branding}
        sessionState={session?.state ?? null}
        seats={seatSummary(rows, capacity)}
        registered={registration ? { name: registration.name, email: registration.email, code: registration.code, status: registrationStatus(registration), position: waitlistPosition(rows, registration.id) } : null}
      />
    </PublicShell>
  );
}
