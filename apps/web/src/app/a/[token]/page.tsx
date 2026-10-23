import type { Metadata } from "next";
import { PublicShell } from "@/components/AppShell";
import { MagicLink } from "@/components/MagicLink";

export const metadata: Metadata = { title: "Opening your webinar" };

/** The personal link from every email. Binds the registration to this browser and walks in. */
export default async function MagicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <PublicShell narrow>
      <MagicLink token={token} />
    </PublicShell>
  );
}
