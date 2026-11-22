"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input, Logo, TextLink } from "@/components/ui";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") ?? "/host";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in failed. Try again." : null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Signed in on the server, so the session cookie is set by a response header and keeps
      // its full life in every browser; see /api/auth/login.
      await api("/api/auth/login", { email, password });
    } catch (err) {
      setBusy(false);
      setError((err as Error).message);
      return;
    }
    // The browser client reads the same cookie; asking it for the session once makes sure the
    // realtime and query clients on the next page start signed in rather than anonymous.
    await supabaseBrowser().auth.getSession();
    setBusy(false);
    router.push(next);
    router.refresh();
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Link href="/" className="mb-8 self-center">
        <Logo />
      </Link>
      <Card className="p-8">
        <h1 className="text-2xl tracking-tight text-ink">Log in to host</h1>
        <p className="mt-1 text-sm text-ink-muted">Email and password. Attendees don&apos;t need an account.</p>
        <form onSubmit={(e) => void signIn(e)} className="mt-6 space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={busy} size="lg" className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-ink-muted">
        New here? <TextLink href={`/signup?next=${encodeURIComponent(next)}`}>Open your room</TextLink>
      </p>
      <p className="mt-2 text-center text-sm text-ink-muted">
        Attending an event? <TextLink href="/join">Join a room</TextLink>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
