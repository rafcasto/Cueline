"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input, TextLink } from "@/components/ui";
import { api } from "@/lib/api";
import { ensureViewerIdentity } from "@/lib/supabase/browser";
import type { SessionState } from "@/lib/supabase/types";

export type ClaimResult = { name: string; room_slug: string | null; invite_token: string | null; title: string | null; starts_at: string | null; session_state: SessionState | null };

/** Where a claimed registration should land: the room if it is open, otherwise the event page. */
export function destinationFor(r: ClaimResult) {
  if (r.room_slug && (r.session_state === "live" || r.session_state === "waiting")) return `/r/${r.room_slug}`;
  if (r.invite_token) return `/join/${r.invite_token}`;
  return r.room_slug ? `/r/${r.room_slug}` : "/";
}

export function JoinForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensureViewerIdentity()
      .then(() => setReady(true))
      .catch((err: Error) => setError(err.message));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<ClaimResult>("/api/claim", { email, code });
      router.replace(destinationFor(r));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="p-8">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Join a room</h1>
      <p className="mt-1 text-sm text-ink-muted">Use the email you registered with and the code from your confirmation email.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <Field label="Email" htmlFor="join-email">
          <Input id="join-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Join code" htmlFor="join-code" hint="Six letters and numbers, for example K7PQ2M.">
          <Input
            id="join-code"
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            className="font-mono text-lg tracking-[0.3em] uppercase"
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={!ready} loading={busy}>
          Join
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        The link in your email works too, no typing. Not registered yet? Open the invite link from the organiser. Hosting? <TextLink href="/login">Sign in</TextLink>.
      </p>
    </Card>
  );
}
