"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
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
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <h1 className="text-2xl font-semibold">Cueline</h1>
      <p className="mt-2 text-sm text-neutral-500">Hosts sign in with email and password.</p>
      <form onSubmit={(e) => void signIn(e)} className="mt-6 space-y-3 text-left">
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-300">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-300">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
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
