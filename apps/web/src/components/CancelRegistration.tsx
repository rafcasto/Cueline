"use client";
import { useState } from "react";
import { formatStart } from "@/components/RegisterForm";
import { Alert, Button, ButtonLink, Card } from "@/components/ui";
import { api } from "@/lib/api";
import type { RegistrationStatus } from "@/lib/seats";
import { ensureViewerIdentity } from "@/lib/supabase/browser";

type Found = { name: string; title: string; startsAt: string | null; inviteToken: string; status: RegistrationStatus };

/** One question, one button: free the seat (or leave the waiting list), then a way back if they change their mind. */
export function CancelRegistration({ token, found }: { token: string; found: Found | null }) {
  const [status, setStatus] = useState<RegistrationStatus | null>(found?.status ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureViewerIdentity();
      await api("/api/register/cancel", { token });
      setStatus("cancelled");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!found) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">This link didn&apos;t work</h1>
        <p className="mt-2 text-sm text-ink-muted">We could not find a registration for it. The event may have been removed, or the link was cut short in your email.</p>
        <ButtonLink href="/join" variant="secondary" className="mt-6">
          Join with email and code instead
        </ButtonLink>
      </Card>
    );
  }
  const when = found.startsAt ? formatStart(found.startsAt) : null;
  const waiting = status === "waitlisted";
  return (
    <Card className="p-8">
      {status === "cancelled" ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{waiting ? "You left the waiting list" : "Your seat is free"}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Thanks for letting us know, {found.name}. {waiting ? "" : "It goes to the next person in line. "}No more emails about {found.title} will reach you.
          </p>
          <p className="mt-4 text-sm text-ink-muted">Changed your mind? You can register again while seats remain, or join the waiting list.</p>
          <ButtonLink href={`/join/${found.inviteToken}`} variant="secondary" className="mt-6">
            Back to the event
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{waiting ? "Leave the waiting list" : "Free your seat"}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{found.title}</h1>
          {when && <p className="mt-1 text-sm text-ink-muted">{when}</p>}
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            {waiting ? `${found.name}, you are on the waiting list for this event. Leave it and we stop emailing you about it.` : `${found.name}, you have a seat at this event. If you are not coming, free it and it goes to the next person on the waiting list; you stop getting reminders.`}
          </p>
          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void optOut()} loading={busy} variant="danger" size="lg">
              {waiting ? "Leave the waiting list" : "Yes, free my seat"}
            </Button>
            <ButtonLink href={`/a/${token}`} variant="secondary" size="lg">
              No, I&apos;m coming
            </ButtonLink>
          </div>
        </>
      )}
    </Card>
  );
}
