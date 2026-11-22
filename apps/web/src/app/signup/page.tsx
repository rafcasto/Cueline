"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Alert, Button, ButtonLink, Card, Field, Input, Logo, TextLink } from "@/components/ui";
import { api } from "@/lib/api";
import { PASSWORD_MIN } from "@/lib/signup";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * The host door from every "start" button on the site. Three fields and one promise: the
 * first room is free, no card. On the way out the host is either signed in and sent to their
 * rooms (or wherever ?next= points, the billing page from a pricing card), or asked to confirm
 * their email first when the project requires it.
 */
function SignupInner() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") ?? "/host";
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let r: { signedIn: boolean; email: string; next: string };
    try {
      r = await api("/api/auth/signup", { organisation, email, password, next });
    } catch (err) {
      setBusy(false);
      setError((err as Error).message);
      return;
    }
    if (!r.signedIn) {
      setBusy(false);
      setConfirm(r.email);
      return;
    }
    // Same as login: the browser client reads the cookie the server just set, so the next page
    // starts signed in rather than anonymous.
    await supabaseBrowser().auth.getSession();
    setBusy(false);
    router.push(r.next);
    router.refresh();
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Link href="/" className="mb-8 self-center">
        <Logo />
      </Link>
      {confirm ? (
        <Card className="p-8">
          <h1 className="text-2xl tracking-tight text-ink">Check your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            We sent a link to <strong className="font-medium text-ink">{confirm}</strong>. Open it and you land in your rooms, signed in. Your organisation is already set up and waiting.
          </p>
          <p className="mt-6 text-sm text-ink-muted">
            Nothing there after a minute? Look in spam, or <TextLink href="/login">log in</TextLink> once you have confirmed.
          </p>
        </Card>
      ) : (
        <Card className="p-8">
          <h1 className="text-2xl tracking-tight text-ink">Open your room</h1>
          <p className="mt-1 text-sm text-ink-muted">Your first room is free. No card.</p>
          <form onSubmit={(e) => void signUp(e)} className="mt-6 space-y-4">
            <Field label="Organisation" htmlFor="signup-org" hint="Shown on your rooms and your invoices. Your own name is fine.">
              <Input id="signup-org" autoComplete="organization" required maxLength={80} autoFocus value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="Tuesday Sessions" />
            </Field>
            <Field label="Email" htmlFor="signup-email">
              <Input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="signup-password" hint={`At least ${PASSWORD_MIN} characters.`}>
              <Input id="signup-password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && (
              <Alert tone="danger">
                {error}
                {/already an account/i.test(error) && (
                  <>
                    {" "}
                    <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="ghost" size="sm" className="mt-2 -ml-3">
                      Go to log in
                    </ButtonLink>
                  </>
                )}
              </Alert>
            )}
            <Button type="submit" loading={busy} size="lg" className="w-full">
              Create my room
            </Button>
            <p className="text-center text-xs text-ink-muted">Attendees never need an account; this is for hosts only.</p>
          </form>
        </Card>
      )}
      <p className="mt-6 text-center text-sm text-ink-muted">
        Already hosting? <TextLink href={`/login?next=${encodeURIComponent(next)}`}>Log in</TextLink>
      </p>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInner />
    </Suspense>
  );
}
