"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { StripeMode } from "@/lib/supabase/types";

/**
 * Platform admins only: which Stripe account new checkouts go to. Existing subscriptions keep
 * the mode they were made in; webhooks from both modes are always accepted.
 */
export function StripeModeSwitch({ mode, configured }: { mode: StripeMode; configured: Record<StripeMode, boolean> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = async (next: StripeMode) => {
    if (next === mode) return;
    if (next === "live" && !confirm("Switch payments to the LIVE Stripe account? Every checkout from now on charges real cards.")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/stripe-mode", { mode: next });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Stripe account <Badge tone="neutral">platform admin</Badge>
          </span>
        }
        description="Where new checkouts and portal sessions are created. Subscriptions already made keep their own account, and webhooks from both are processed."
      />
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {(["test", "live"] as StripeMode[]).map((m) => (
          <Button key={m} variant={mode === m ? (m === "live" ? "danger" : "primary") : "secondary"} onClick={() => void set(m)} disabled={busy || !configured[m]} title={configured[m] ? undefined : `STRIPE_SECRET_KEY_${m.toUpperCase()} is not set`}>
            {m === "test" ? "Sandbox (test)" : "Live"}
            {mode === m ? " · active" : ""}
            {!configured[m] ? " · keys missing" : ""}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Keys: <code>STRIPE_SECRET_KEY_TEST</code> / <code>STRIPE_SECRET_KEY_LIVE</code>, the two webhook secrets and the two publishable keys. See docs/STRIPE.md.
      </p>
    </Card>
  );
}
