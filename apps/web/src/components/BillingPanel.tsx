"use client";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { PLAN_LIMITS, PRICE_LABELS, type Plan, type PriceLookup } from "@/lib/plans";
import type { PlanStatus, StripeMode } from "@/lib/supabase/types";

export type BillingSummary = {
  org: {
    id: string;
    name: string;
    plan: Plan;
    plan_status: PlanStatus;
    plan_period_end: string | null;
    stripe_mode: StripeMode | null;
    has_customer: boolean;
    has_subscription: boolean;
  };
  used: number;
  cap: number | null;
  passes: number;
  period_end: string;
  owner: boolean;
};

const PLAN_ROWS: { plan: Plan; monthly: PriceLookup; yearly: PriceLookup }[] = [
  { plan: "starter", monthly: "starter_monthly", yearly: "starter_yearly" },
  { plan: "pro", monthly: "pro_monthly", yearly: "pro_yearly" },
];

/** One organisation's plan: what it allows, what has been used, and the buttons that change it. */
export function BillingPanel({ summary, mode }: { summary: BillingSummary; mode: StripeMode }) {
  const { org } = summary;
  const limits = PLAN_LIMITS[org.plan];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resets = new Date(summary.period_end).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const go = async (key: string, path: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const r = await api<{ url: string }>(path, body);
      window.location.assign(r.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };
  const buy = (price: PriceLookup) => go(price, "/api/billing/checkout", { org_id: org.id, price });
  const portal = () => go("portal", "/api/billing/portal", { org_id: org.id });
  const otherMode = org.stripe_mode && org.stripe_mode !== mode;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {org.name}
            <Badge tone={org.plan === "free" ? "neutral" : "brand"}>{limits.label}</Badge>
            {org.plan_status === "past_due" && <Badge tone="warning">Payment overdue</Badge>}
            {org.stripe_mode === "test" && org.has_subscription && <Badge tone="warning">Sandbox subscription</Badge>}
          </span>
        }
        description={`${limits.participants} attendees · ${limits.minutes >= 60 ? `${limits.minutes / 60} h` : `${limits.minutes} min`} per session · ${limits.recording ? "recording" : "no recording"} · ${limits.promoteSlots} on stage`}
        actions={
          summary.owner && org.has_customer ? (
            <Button variant="secondary" size="sm" onClick={() => void portal()} loading={busy === "portal"}>
              Manage billing
            </Button>
          ) : undefined
        }
      />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat value={summary.cap === null ? `${summary.used}` : `${summary.used} / ${summary.cap}`} label={summary.cap === null ? `sessions this month (unlimited)` : `sessions used, resets ${resets}`} />
        <Stat value={summary.passes} label="event passes ready to use" />
        <Stat value={limits.participants} label="attendees per session" />
      </div>
      {org.plan_status === "past_due" && (
        <Alert tone="warning" className="mt-4">
          The last payment failed. Stripe retries for about two weeks; update the card under <em>Manage billing</em> to keep the plan.
        </Alert>
      )}
      {otherMode && (
        <Alert tone="neutral" className="mt-4">
          This organisation&apos;s billing lives in Stripe {org.stripe_mode} mode while new payments go to {mode} mode. <em>Manage billing</em> still opens the right account.
        </Alert>
      )}
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {summary.owner ? (
        <div className="mt-6 space-y-3">
          {PLAN_ROWS.map((row) => {
            const l = PLAN_LIMITS[row.plan];
            const current = org.plan === row.plan;
            return (
              <div key={row.plan} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {l.label} {current && <Badge tone="success">current</Badge>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {l.sessionsPerMonth === null ? "Unlimited sessions" : `${l.sessionsPerMonth} sessions a month`} · {l.participants} attendees · {l.minutes / 60} h ·{" "}
                    {l.recording ? "recording" : "no recording"}
                    {l.hlsFallback ? " · fallback stream" : ""} · {l.promoteSlots} on stage{l.stripeCta ? " · Stripe call to action" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={current ? "ghost" : "primary"} onClick={() => void buy(row.monthly)} loading={busy === row.monthly} disabled={!!busy}>
                    {PRICE_LABELS[row.monthly].amount}/{PRICE_LABELS[row.monthly].period}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void buy(row.yearly)} loading={busy === row.yearly} disabled={!!busy}>
                    {PRICE_LABELS[row.yearly].amount}/{PRICE_LABELS[row.yearly].period}
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Event pass</p>
              <p className="text-xs text-ink-muted">One more session this month: 50 attendees, 3 hours, recorded. Spent automatically when the plan&apos;s sessions are used up.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void buy("event_pass")} loading={busy === "event_pass"} disabled={!!busy}>
              {PRICE_LABELS.event_pass.amount} per event
            </Button>
          </div>
          {org.has_subscription && <p className="text-xs text-ink-faint">Choosing another plan opens the billing portal, where the change is prorated; cancelling is there too.</p>}
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-muted">Only the organisation&apos;s owner can change the plan.</p>
      )}
    </Card>
  );
}
