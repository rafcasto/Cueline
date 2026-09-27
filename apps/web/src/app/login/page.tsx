"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { publicEnv } from "@/lib/env";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/host";
  const signIn = () =>
    supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        // Slides read access lets the host panel sync cues from speaker notes.
        scopes: "https://www.googleapis.com/auth/presentations.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  return (
    <main className="mx-auto max-w-sm p-6 text-center">
      <h1 className="text-2xl font-semibold">Cueline</h1>
      <p className="mt-2 text-sm text-neutral-500">Hosts sign in with Google so Cueline can read cues from your speaker notes.</p>
      {params.get("error") && <p className="mt-3 text-sm text-red-600">Sign-in failed. Try again.</p>}
      <button onClick={() => void signIn()} className="mt-6 w-full rounded bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900">
        Continue with Google
      </button>
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
