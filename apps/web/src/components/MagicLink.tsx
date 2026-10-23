"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { destinationFor, type ClaimResult } from "@/components/JoinForm";
import { Alert, ButtonLink, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ensureViewerIdentity } from "@/lib/supabase/browser";

export function MagicLink({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureViewerIdentity();
        const r = await api<ClaimResult>("/api/claim", { token });
        if (cancelled) return;
        setName(r.name);
        router.replace(destinationFor(r));
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <Card className="p-8 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-ink">This link didn&apos;t work</h1>
          <Alert tone="danger" className="mt-4 text-left">
            {error}
          </Alert>
          <ButtonLink href="/join" variant="secondary" className="mt-6">
            Join with email and code instead
          </ButtonLink>
        </>
      ) : (
        <>
          <Spinner className="mx-auto size-6 text-brand" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">{name ? `Welcome back, ${name}` : "Opening your webinar"}</h1>
          <p className="mt-1 text-sm text-ink-muted">One moment. No email or code needed on this device from now on.</p>
        </>
      )}
    </Card>
  );
}
