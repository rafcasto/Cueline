import type { Metadata } from "next";
import { PublicShell } from "@/components/AppShell";
import { CancelRegistration } from "@/components/CancelRegistration";
import { registrationStatus } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Invite, Registration } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Free your seat" };

/**
 * The opt-out link from every email. Shows who is registered for what, and one button that
 * frees the seat for the waiting list. The token is the registration's own, so it works from
 * any device without signing in.
 */
export default async function CancelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const valid = /^[A-Za-z0-9_-]{10,64}$/.test(token);
  const { data: reg } = valid ? await admin.from("registrations").select("*").eq("access_token", token).maybeSingle() : { data: null };
  const { data: invite } = reg ? await admin.from("invites").select("*").eq("id", reg.invite_id).maybeSingle() : { data: null };
  const registration = reg as Registration | null;
  const event = invite as Invite | null;
  return (
    <PublicShell narrow>
      <CancelRegistration
        token={token}
        found={registration && event ? { name: registration.name, title: event.title, startsAt: event.starts_at, inviteToken: event.token, status: registrationStatus(registration) } : null}
      />
    </PublicShell>
  );
}
