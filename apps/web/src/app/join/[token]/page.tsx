import { notFound } from "next/navigation";
import { RegisterForm } from "@/components/RegisterForm";
import { inviteByToken, registrationFor } from "@/lib/invites";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The invite link. One page does the whole attendee side: what the webinar is, when it is,
 * a two-field registration, and the door into the room once registered.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await inviteByToken(token);
  if (!found) notFound();
  const { invite, room, session } = found;

  // A returning attendee already has an identity cookie from the first visit; skip the form for them.
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const registration = auth.user ? await registrationFor(room.id, auth.user.id) : null;

  return (
    <RegisterForm
      token={invite.token}
      title={invite.title}
      description={invite.description}
      startsAt={invite.starts_at}
      revoked={!!invite.revoked_at}
      roomName={room.name}
      roomSlug={room.slug}
      waitingRoom={room.waiting_room}
      sessionState={session?.state ?? null}
      registered={registration ? { name: registration.name, email: registration.email } : null}
    />
  );
}
