"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { WaitingRoom } from "@/components/WaitingRoom";
import { api } from "@/lib/api";
import { ensureViewerIdentity } from "@/lib/supabase/browser";
import type { SessionState, WaitingRoom as WaitingRoomConfig } from "@/lib/supabase/types";

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
  registered: { name: string; email: string } | null;
};

/** True when the browser refuses to keep a cookie for this page (settings, private mode, or an embedded frame). */
function cookiesBlocked() {
  if (typeof navigator !== "undefined" && !navigator.cookieEnabled) return true;
  try {
    document.cookie = "cueline_probe=1; SameSite=Lax; path=/";
    const ok = document.cookie.includes("cueline_probe=1");
    document.cookie = "cueline_probe=; Max-Age=0; path=/";
    return !ok;
  } catch {
    return true;
  }
}

function browserCookieHelp() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad/.test(ua)) return "On iPhone or iPad: Settings, Safari, turn off \"Block All Cookies\".";
  if (/Android/.test(ua)) return "On Android Chrome: tap the three dots, Settings, Site settings, Third-party cookies, and allow cookies.";
  if (/Firefox/.test(ua)) return "In Firefox: click the shield icon in the address bar and turn Enhanced Tracking Protection off for this site.";
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return "In Safari: Safari menu, Settings, Privacy, turn off \"Block all cookies\".";
  return "In Chrome or Edge: click the lock or tune icon in the address bar, Cookies and site data, and allow cookies for this site.";
}

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
  const [done, setDone] = useState(props.registered);
  const [sessionState, setSessionState] = useState(props.sessionState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

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
      .catch((err: Error) => {
        // A page cannot turn cookies on for the visitor, but it can tell which problem it has:
        // storage blocked by the browser, or the project refusing anonymous sign-in.
        if (cookiesBlocked()) setBlocked(true);
        else setError(`Could not start a session${err?.message ? ` (${err.message})` : ""}. Reload to try again.`);
      });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ registration: { name: string; email: string }; session_state: SessionState | null }>("/api/register", { token: props.token, name, email });
      setDone(r.registration);
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
      ? { text: "The webinar is live right now.", cta: "Join now", tone: "bg-green-600" }
      : sessionState === "waiting"
        ? { text: "Doors are open. The host is about to start.", cta: "Enter the waiting room", tone: "bg-indigo-600" }
        : { text: when ? `Starts ${when}. Come back to this link when it is time.` : "The host has not opened the room yet. Come back to this link when it is time.", cta: "Open the room", tone: "bg-neutral-800 dark:bg-neutral-200 dark:text-neutral-900" };

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <WaitingRoom config={props.waitingRoom} />
      <section className="mx-auto -mt-6 max-w-xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 sm:p-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">{props.roomName}</p>
        <h1 className="mt-1 text-2xl font-semibold">{props.title}</h1>
        {when && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{when}</p>}
        {props.description && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">{props.description}</p>}

        {props.revoked && !done ? (
          <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            This invite link is no longer active. Ask the organiser for a new one.
          </p>
        ) : done ? (
          <div className="mt-5 space-y-3">
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
              You are registered as <strong>{done.name}</strong> ({done.email}). {door.text}
            </p>
            <Link href={`/r/${props.roomSlug}`} className={`block rounded-lg px-4 py-3 text-center font-medium text-white ${door.tone}`}>
              {door.cta}
            </Link>
            <p className="text-center text-xs text-neutral-500">Keep this link. It is your way in on the day, on any device.</p>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
            <label className="block text-sm">
              <span className="text-neutral-600 dark:text-neutral-300">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                autoComplete="name"
                placeholder="Shown to the host and other attendees"
                className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600 dark:text-neutral-300">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="So the host can follow up with you"
                className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </label>
            {blocked && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-medium">This page needs cookies to remember your registration.</p>
                <p className="mt-1">{browserCookieHelp()} If you opened this link inside another app, open it in your browser instead.</p>
                <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded bg-amber-900 px-3 py-1 text-white dark:bg-amber-100 dark:text-amber-950">
                  I have enabled cookies, reload
                </button>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={!ready || busy} className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-50">
              {busy ? "Registering…" : sessionState === "live" ? "Register and join now" : "Register"}
            </button>
            <p className="text-center text-xs text-neutral-500">{when ? `Starts ${when}.` : "No account needed."}</p>
          </form>
        )}
      </section>
    </main>
  );
}
