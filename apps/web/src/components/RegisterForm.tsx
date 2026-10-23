"use client";
import { useEffect, useState, type FormEvent } from "react";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Alert, Badge, Button, ButtonLink, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { ensureViewerIdentity } from "@/lib/supabase/browser";
import type { SessionState, WaitingRoom as WaitingRoomConfig } from "@/lib/supabase/types";

type Registered = { name: string; email: string; code: string };
type Props = {
  token: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  revoked: boolean;
  roomName: string;
  roomSlug: string;
  waitingRoom: WaitingRoomConfig;
  sessionState: SessionState | null;
  registered: Registered | null;
};

export function formatStart(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/**
 * Attendee side of an invite link: register with a name and email, then step into the room.
 * The same page is the door on the day, so the copy follows the session state.
 */
export function RegisterForm(props: Props) {
  const [name, setName] = useState(props.registered?.name ?? "");
  const [email, setEmail] = useState(props.registered?.email ?? "");
  const [done, setDone] = useState<Registered | null>(props.registered);
  const [justRegistered, setJustRegistered] = useState(false);
  const [sessionState, setSessionState] = useState(props.sessionState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The anonymous identity is what the registration binds to; create it before the first submit.
  useEffect(() => {
    void ensureViewerIdentity()
      .then(() => {
        setReady(true);
        // Prefill the name a returning visitor used before (after hydration, so server and client match).
        try {
          const remembered = localStorage.getItem("cueline:name");
          if (remembered) setName((n) => n || remembered);
        } catch {
          /* private mode */
        }
      })
      .catch(() => setError("Could not start a session in this browser. Check that cookies are enabled and reload."));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ registration: Registered; session_state: SessionState | null }>("/api/register", { token: props.token, name, email });
      setDone(r.registration);
      setJustRegistered(true);
      setSessionState(r.session_state);
      try {
        localStorage.setItem("cueline:name", r.registration.name);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const when = props.startsAt ? formatStart(props.startsAt) : null;
  const door =
    sessionState === "live"
      ? { text: "The webinar is live right now.", cta: "Join now", variant: "success" as const }
      : sessionState === "waiting"
        ? { text: "Doors are open. The host is about to start.", cta: "Enter the waiting room", variant: "primary" as const }
        : { text: when ? `Starts ${when}. Come back to this link, or use the one in your email, when it is time.` : "The host has not opened the room yet. Come back to this link when it is time.", cta: "Open the room", variant: "secondary" as const };

  return (
    <div className="mx-auto max-w-3xl">
      <WaitingRoom config={props.waitingRoom} />
      <section className="relative mx-auto -mt-8 max-w-xl rounded-2xl border border-line bg-surface-raised p-6 shadow-float sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{props.roomName}</p>
          {sessionState === "live" && (
            <Badge tone="live" dot>
              Live now
            </Badge>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink">{props.title}</h1>
        {when && <p className="mt-2 text-sm font-medium text-ink-muted">{when}</p>}
        {props.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{props.description}</p>}

        {props.revoked && !done ? (
          <Alert tone="warning" className="mt-6">
            This invite link is no longer active. Ask the organiser for a new one.
          </Alert>
        ) : done ? (
          <div className="mt-6 space-y-4">
            <Alert tone="success" title={justRegistered ? `You're registered, ${done.name}.` : `Welcome back, ${done.name}.`}>
              {justRegistered ? (
                <>
                  We sent a confirmation to <strong>{done.email}</strong> with your personal link. {door.text}
                </>
              ) : (
                door.text
              )}
            </Alert>
            <ButtonLink href={`/r/${props.roomSlug}`} variant={door.variant} size="lg" className="w-full">
              {door.cta}
            </ButtonLink>
            <div className="rounded-lg border border-line bg-surface-inset px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Your join code</p>
                  <p className="mt-0.5 text-sm text-ink-muted">On another device, go to /join and enter your email with this code.</p>
                </div>
                <code className="shrink-0 rounded-md bg-surface-raised px-3 py-1.5 font-mono text-lg font-semibold tracking-[0.25em] text-ink shadow-card">{done.code}</code>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
            <Field label="Your name" htmlFor="reg-name" hint="Shown to the host and other attendees.">
              <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="reg-email" hint="Your personal link and the reminders go here.">
              <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={!ready} loading={busy}>
              {sessionState === "live" ? "Register and join now" : "Register"}
            </Button>
            <p className="text-center text-xs text-ink-muted">No account needed. {when ? `Starts ${when}.` : ""}</p>
          </form>
        )}
      </section>
    </div>
  );
}
