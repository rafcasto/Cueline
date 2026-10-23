import type { Metadata } from "next";
import { PublicShell } from "@/components/AppShell";
import { JoinForm } from "@/components/JoinForm";

export const metadata: Metadata = { title: "Join a room" };

/** The typed door: email plus the join code from the confirmation email. */
export default function JoinPage() {
  return (
    <PublicShell narrow>
      <JoinForm />
    </PublicShell>
  );
}
