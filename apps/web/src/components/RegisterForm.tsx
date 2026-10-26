"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BrandScope, RoomMark } from "@/components/RoomBrand";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Alert, Badge, Button, ButtonLink, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import type { RegistrationStatus, SeatSummary } from "@/lib/seats";
import { ensureViewerIdentity } from "@/lib/supabase/browser";
import type { RoomBranding, SessionState, WaitingRoom as WaitingRoomConfig } from "@/lib/supabase/types";

type Registered = { name: string; email: string; code: string; status: RegistrationStatus; position: number | null };
type Props = {
  token: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  revoked: boolean;
  roomName: string;
  roomSlug: string;
  waitingRoom: WaitingRoomConfig;
  /** The room's accent and logo; the page takes the colour so the first button an attendee taps is already theirs. */
  branding?: RoomBranding;
  sessionState: SessionState | null;
  /** Seats taken and left; the form says so before anyone types. */
  seats: SeatSummary;
  registered: Registered | null;
};

export function formatStart(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/**
 * Attendee side of an invite link: register with a name and email, then step into the room.
 * The same page is the door on the day, so the copy follows the session state. When the seats
 * are gone the form joins the waiting list instead, and a registrant who cannot come frees
 * their seat from here (or from the link in every email) for the next person in line.
 */
export function RegisterForm(props: Props) {
  const [name, setName] = useState(props.registered?.name ?? "");
  const [email, setEmail] = useState(props.registered?.email ?? "");
  const [done, setDone] = useState<Registered | null>(props.registered);
  const [seats, setSeats] = useState(props.seats);
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
          const remembered = localStorage.getItem("tertulia:name");
          if (remembered) setName((n) => n || remembered);
        } catch {
          /* private mode */
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ registration: { name: string; email: string; code: string }; status: RegistrationStatus; position: number | null; seats: SeatSummary; session_state: SessionState | null }>("/api/register", { token: props.token, name, email });
      setDone({ ...r.registration, status: r.status, position: r.position });
      setSeats(r.seats);
      setJustRegistered(true);
      setSessionState(r.session_state);
      try {
        localStorage.setItem("tertulia:name", r.registration.name);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const optOut = async () => {
    if (!done) return;
    const waiting = done.status === "waitlisted";
    if (!confirm(waiting ? "Leave the waiting list? You can join it again from this page." : "Free your seat? It goes to the next person on the waiting list. You can register again from this page while seats remain.")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/register/cancel", { invite: props.token });
      setDone({ ...done, status: "cancelled", position: null });
      setSeats((s) => (waiting ? { ...s, waiting: Math.max(0, s.waiting - 1) } : { ...s, going: Math.max(0, s.going - 1), left: s.left + 1, full: s.going - 1 >= s.capacity }));
      setJustRegistered(false);
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

  const branding = props.branding ?? {};
  const seated = done?.status === "seated";
  const waitlisted = done?.status === "waitlisted";
  const cancelled = done?.status === "cancelled";
  const showForm = !done || cancelled;
  return (
    <BrandScope branding={branding} className="mx-auto max-w-3xl">
      <WaitingRoom config={props.waitingRoom} />
      <section className="relative mx-auto -mt-8 max-w-xl rounded-2xl border border-line bg-surface-raised p-6 shadow-float sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {branding.logo_url && <RoomMark branding={branding} name={props.roomName} />}
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-ink-muted">{props.roomName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {seats.full && sessionState !== "live" && <Badge tone="warning">Full</Badge>}
            {sessionState === "live" && (
              <Badge tone="live" dot>
                Live now
              </Badge>
            )}
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink">{props.title}</h1>
        {when && <p className="mt-2 text-sm font-medium text-ink-muted">{when}</p>}
        <p className="mt-1 text-sm text-ink-muted">
          {seats.full ? `All ${seats.capacity} seats are taken` : `${seats.left} of ${seats.capacity} seats left`}
          {seats.waiting > 0 ? ` · ${seats.waiting} on the waiting list` : ""}
        </p>
        {props.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{props.description}</p>}

        {props.revoked && showForm ? (
          <Alert tone="warning" className="mt-6">
            This invite link is no longer active. Ask the organiser for a new one.
          </Alert>
        ) : seated && done ? (
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
            {sessionState !== "live" && (
              <p className="text-center text-sm text-ink-muted">
                Can&apos;t make it?{" "}
                <button type="button" onClick={() => void optOut()} disabled={busy} className="font-medium text-brand underline-offset-4 hover:underline disabled:opacity-50">
                  Free your seat
                </button>{" "}
                for the next person in line.
              </p>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        ) : waitlisted && done ? (
          <div className="mt-6 space-y-4">
            <Alert tone="warning" title={done.position ? `You're #${done.position} on the waiting list, ${done.name}.` : `You're on the waiting list, ${done.name}.`}>
              {justRegistered ? (
                <>
                  The seats are taken for now. We sent a note to <strong>{done.email}</strong>; if a seat frees up you get an email with your personal link, and this page updates too.
                </>
              ) : (
                "The seats are taken for now. If one frees up you get an email with your personal link, and this page updates too."
              )}
            </Alert>
            <p className="text-center text-sm text-ink-muted">
              Plans changed?{" "}
              <button type="button" onClick={() => void optOut()} disabled={busy} className="font-medium text-brand underline-offset-4 hover:underline disabled:opacity-50">
                Leave the waiting list
              </button>
              .
            </p>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
            {cancelled && done && (
              <Alert tone="neutral" title={`You freed your seat, ${done.name}.`}>
                Changed your mind? Register again below{seats.full ? "; the seats are taken right now, so you would join the waiting list" : ""}.
              </Alert>
            )}
            {seats.full && !cancelled && (
              <Alert tone="warning" title="This event is full">
                Register anyway to join the waiting list. If someone frees their seat you get it, in order of arrival, with an email to say so.
              </Alert>
            )}
            <Field label="Your name" htmlFor="reg-name" hint="Shown to the host and other attendees.">
              <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="reg-email" hint={seats.full ? "We email you if a seat opens up." : "Your personal link and the reminders go here."}>
              <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={!ready} loading={busy}>
              {seats.full ? "Join the waiting list" : sessionState === "live" ? "Register and join now" : "Register"}
            </Button>
            <p className="text-center text-xs text-ink-muted">No account needed. {when ? `Starts ${when}.` : ""}</p>
          </form>
        )}
      </section>
    </BrandScope>
  );
}
