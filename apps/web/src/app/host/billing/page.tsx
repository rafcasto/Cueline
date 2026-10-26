import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BillingPanel, type BillingSummary } from "@/components/BillingPanel";
import { StripeModeSwitch } from "@/components/StripeModeSwitch";
import { Alert, PageHeader } from "@/components/ui";
import { isPlatformAdmin } from "@/lib/auth";
import { effectivePlan, loadUsage } from "@/lib/billing";
import { roomAllowance } from "@/lib/rooms";
import { activeStripeMode, modeConfigured } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { Organisation } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Plan, usage and payments for every organisation the user owns or hosts; the Stripe
 * sandbox/live switch for platform admins. The webhook is the source of truth for the plan, so
 * after a checkout this page reads the database rather than trusting the redirect.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  // Checkout for a plan or for an extra room both come back here; the webhook does the granting.
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/host/billing");
  const params = await searchParams;

  const { data: memberships } = await sb.from("org_members").select("org_id, role");
  const orgIds = (memberships ?? []).map((m) => m.org_id);
  const admin = supabaseAdmin();
  const [{ data: orgs }, mode, platformAdmin, { data: roomRows }] = await Promise.all([
    orgIds.length ? admin.from("organisations").select("*").in("id", orgIds).order("name") : Promise.resolve({ data: [] as Organisation[] }),
    activeStripeMode(),
    isPlatformAdmin(auth.user.id),
    orgIds.length ? admin.from("rooms").select("org_id").in("org_id", orgIds) : Promise.resolve({ data: [] as { org_id: string }[] }),
  ]);

  const summaries: BillingSummary[] = await Promise.all(
    ((orgs ?? []) as Organisation[]).map(async (org) => {
      const usage = await loadUsage(admin, org);
      const role = (memberships ?? []).find((m) => m.org_id === org.id)?.role ?? "presenter";
      const roomsUsed = (roomRows ?? []).filter((r) => r.org_id === org.id).length;
      return {
        org: { id: org.id, name: org.name, plan: effectivePlan(org), plan_status: org.plan_status, plan_period_end: org.plan_period_end, stripe_mode: org.stripe_mode, has_customer: !!org.stripe_customer_id, has_subscription: !!org.stripe_subscription_id },
        used: usage.used,
        cap: usage.limits.sessionsPerMonth,
        period_end: usage.period.end.toISOString(),
        owner: role === "owner",
        rooms: { used: roomsUsed, included: usage.limits.roomsIncluded, extra: org.extra_rooms ?? 0, allowance: roomAllowance(usage.limits, org.extra_rooms ?? 0, platformAdmin) },
      };
    }),
  );

  return (
    <AppShell email={auth.user.email} crumb="Billing">
      <PageHeader title="Plan and billing" description="Sessions, attendees, length and reminder emails come from the plan; every plan includes one room and more can be bought here. Change the plan here; Stripe prorates the difference." />
      {params.checkout === "success" && (
        <Alert tone="success" className="mt-6" title="Payment received">
          Stripe is confirming the subscription; the plan below updates within a few seconds. Reload if it still shows the old one.
        </Alert>
      )}
      {params.checkout === "room" && (
        <Alert tone="success" className="mt-6" title="Payment received">
          Stripe is confirming the purchase; the extra room appears below within a few seconds, and you can create it from your rooms page. Reload if the count has not moved.
        </Alert>
      )}
      {params.checkout === "cancelled" && (
        <Alert tone="neutral" className="mt-6">
          Nothing was charged.
        </Alert>
      )}
      {mode === "test" && (
        <Alert tone="warning" className="mt-6" title="Payments are in the Stripe sandbox">
          Checkout opens on Stripe&apos;s test account: use card number 4242 4242 4242 4242 with any future date and CVC. No money moves.
          {platformAdmin ? " Switch to live below when you are ready to charge." : ""}
        </Alert>
      )}
      <div className="mt-6 space-y-6">
        {summaries.length === 0 ? (
          <Alert tone="neutral">You are not in an organisation yet.</Alert>
        ) : (
          summaries.map((s) => <BillingPanel key={s.org.id} summary={s} mode={mode} />)
        )}
      </div>
      {platformAdmin && (
        <div className="mt-10">
          <StripeModeSwitch mode={mode} configured={{ test: modeConfigured("test"), live: modeConfigured("live") }} />
        </div>
      )}
    </AppShell>
  );
}
