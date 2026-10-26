import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BillingPanel, type BillingRoom, type BillingSummary } from "@/components/BillingPanel";
import { StripeModeSwitch } from "@/components/StripeModeSwitch";
import { Alert, PageHeader } from "@/components/ui";
import { isPlatformAdmin } from "@/lib/auth";
import { billingPeriod, roomAccess } from "@/lib/billing";
import { activeStripeMode, modeConfigured } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { Organisation, Room, RoomSubscription } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Plan, usage and payments for every room in every organisation the user owns or hosts; the
 * Stripe sandbox/live switch for platform admins. The webhook is the source of truth for the
 * plan, so after a checkout this page reads the database rather than trusting the redirect.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/host/billing");
  const params = await searchParams;

  const { data: memberships } = await sb.from("org_members").select("org_id, role");
  const orgIds = (memberships ?? []).map((m) => m.org_id);
  const admin = supabaseAdmin();
  const [{ data: orgs }, { data: rooms }, { data: subs }, mode, platformAdmin] = await Promise.all([
    orgIds.length ? admin.from("organisations").select("*").in("id", orgIds).order("name") : Promise.resolve({ data: [] as Organisation[] }),
    orgIds.length ? admin.from("rooms").select("*").in("org_id", orgIds).order("created_at") : Promise.resolve({ data: [] as Room[] }),
    orgIds.length ? admin.from("room_subscriptions").select("*").in("org_id", orgIds) : Promise.resolve({ data: [] as RoomSubscription[] }),
    activeStripeMode(),
    isPlatformAdmin(auth.user.id),
  ]);
  const now = new Date();

  const summaries: BillingSummary[] = await Promise.all(
    ((orgs ?? []) as Organisation[]).map(async (org) => {
      const mine = ((rooms ?? []) as Room[]).filter((r) => r.org_id === org.id);
      const role = (memberships ?? []).find((m) => m.org_id === org.id)?.role ?? "presenter";
      const billingRooms: BillingRoom[] = await Promise.all(
        mine.map(async (room) => {
          const sub = ((subs ?? []) as RoomSubscription[]).find((s) => s.room_id === room.id) ?? null;
          const access = roomAccess(room, mine.length);
          const period = billingPeriod({ plan_period_start: sub?.current_period_start ?? null, plan_period_end: sub?.current_period_end ?? null }, now);
          const { count } = await admin.from("sessions").select("id", { count: "exact", head: true }).eq("room_id", room.id).eq("counted", true).gte("started_at", period.start.toISOString()).lt("started_at", period.end.toISOString());
          return {
            id: room.id,
            name: room.name,
            slug: room.slug,
            plan: room.plan,
            plan_status: room.plan_status,
            access,
            price_lookup: sub?.price_lookup ?? null,
            has_subscription: !!sub?.stripe_subscription_id,
            stripe_mode: sub?.stripe_mode ?? null,
            used: count ?? 0,
            cap: access.limits.sessionsPerMonth,
            period_end: period.end.toISOString(),
          };
        }),
      );
      return {
        org: { id: org.id, name: org.name, stripe_mode: org.stripe_mode, has_customer: !!org.stripe_customer_id },
        rooms: billingRooms,
        owner: role === "owner",
        platform_admin: platformAdmin,
      };
    }),
  );

  return (
    <AppShell email={auth.user.email} crumb="Billing">
      <PageHeader title="Plan and billing" description="Each room has its own plan: sessions a month, attendees, length, recording and reminder emails. Your first room is free until you upgrade it; every further room is a Starter or Pro subscription. Stripe prorates plan changes." />
      {params.checkout === "success" && (
        <Alert tone="success" className="mt-6" title="Payment received">
          Stripe is confirming the subscription; the room&apos;s plan below updates within a few seconds. Reload if it still shows the old one.
        </Alert>
      )}
      {params.checkout === "cancelled" && (
        <Alert tone="neutral" className="mt-6">
          Nothing was charged. A room you were adding stays below as <em>payment pending</em> until you complete it or delete it from its Settings tab.
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
