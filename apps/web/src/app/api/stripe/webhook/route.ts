import type Stripe from "stripe";
import { effectivePlan } from "@/lib/billing";
import { planFromPrice, type Plan } from "@/lib/plans";
import { afterPlanChange } from "@/lib/seats-server";
import { type StripeMode, stripeFor, verifyWebhook } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * One endpoint for both Stripe modes and every kind of payment: CTA orders bought by attendees
 * in the room, plan subscriptions, and rooms bought beyond the plan. The signature says which
 * mode the event came from; the event id makes a redelivery a no-op. Access is granted here and
 * nowhere else.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  let mode: StripeMode;
  try {
    ({ event, mode } = verifyWebhook(raw, sig));
  } catch (err) {
    return Response.json({ error: `bad signature: ${(err as Error).message}` }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error: seen } = await admin.from("stripe_events").insert({ id: event.id, stripe_mode: mode, type: event.type });
  if (seen) {
    if (seen.code === "23505") return Response.json({ received: true, duplicate: true });
    throw seen;
  }
  const now = new Date().toISOString();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const cs = event.data.object;
      if (cs.mode === "subscription" && typeof cs.subscription === "string") {
        const orgId = cs.metadata?.org_id ?? cs.client_reference_id ?? null;
        const sub = await stripeFor(mode).subscriptions.retrieve(cs.subscription);
        await applySubscription(admin, mode, sub, orgId);
      } else if (cs.metadata?.kind === "room") {
        // Paid once per purchase: the function adds nothing on a redelivery.
        const { error } = await admin.rpc("grant_extra_room", { p_session_id: cs.id, p_amount: cs.amount_total, p_currency: cs.currency });
        if (error) throw error;
      } else {
        await completeCtaOrder(admin, cs);
      }
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const id = event.data.object.id;
      await admin.from("orders").update({ status: "failed", updated_at: now }).eq("stripe_session_id", id);
      await admin.from("room_purchases").update({ status: "failed" }).eq("stripe_session_id", id).eq("status", "pending");
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applySubscription(admin, mode, event.data.object, event.data.object.metadata?.org_id ?? null);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = subscriptionOfInvoice(event.data.object);
      if (subId) {
        const sub = await stripeFor(mode).subscriptions.retrieve(subId);
        await applySubscription(admin, mode, sub, sub.metadata?.org_id ?? null, event.type === "invoice.payment_failed" ? "past_due" : undefined);
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}

type PlanStatus = "active" | "past_due" | "canceled";

/**
 * Mirror a subscription onto its organisation: plan from the price, status from Stripe, the
 * current period for the session count, and the ids to find it again. A cancelled or expired
 * subscription puts the organisation back on free. When the plan in force changes, seats and
 * reminders follow it (afterPlanChange).
 */
async function applySubscription(admin: ReturnType<typeof supabaseAdmin>, mode: StripeMode, sub: Stripe.Subscription, orgIdHint: string | null, forceStatus?: PlanStatus) {
  const orgId = orgIdHint ?? (await findOrg(admin, mode, sub));
  if (!orgId) {
    console.warn("subscription without an organisation", mode, sub.id);
    return;
  }
  const item = sub.items.data[0];
  const price = item?.price;
  let plan: Plan | null = planFromPrice(price?.lookup_key, null);
  if (!plan && price) {
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    const product = await stripeFor(mode).products.retrieve(productId);
    plan = planFromPrice(null, product.metadata?.plan);
  }

  const status: PlanStatus =
    forceStatus ??
    (sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : sub.status === "canceled" || sub.status === "incomplete_expired"
          ? "canceled"
          : "active");
  if (sub.status === "incomplete") return; // first payment not through yet; checkout.session.completed follows

  const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null;
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const gone = status === "canceled";
  const { data: before } = await admin.from("organisations").select("id, plan, plan_status").eq("id", orgId).maybeSingle();

  const { error } = await admin
    .from("organisations")
    .update({
      plan: gone || !plan ? "free" : plan,
      plan_status: status,
      stripe_mode: mode,
      stripe_customer_id: customer,
      stripe_subscription_id: gone ? null : sub.id,
      plan_price_lookup: gone ? null : (price?.lookup_key ?? null),
      plan_period_start: gone ? null : periodStart,
      plan_period_end: gone ? null : periodEnd,
    })
    .eq("id", orgId);
  if (error) throw error;

  const was = before ? effectivePlan(before) : null;
  const is = effectivePlan({ id: orgId, plan: gone || !plan ? "free" : plan, plan_status: status });
  if (was !== is) {
    try {
      await afterPlanChange(orgId);
    } catch (err) {
      console.error("after plan change", orgId, err);
    }
  }
}

async function findOrg(admin: ReturnType<typeof supabaseAdmin>, mode: StripeMode, sub: Stripe.Subscription): Promise<string | null> {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const bySub = await admin.from("organisations").select("id").eq("stripe_mode", mode).eq("stripe_subscription_id", sub.id).maybeSingle();
  if (bySub.data) return bySub.data.id;
  const byCustomer = await admin.from("organisations").select("id").eq("stripe_mode", mode).eq("stripe_customer_id", customer).maybeSingle();
  return byCustomer.data?.id ?? null;
}

/** The subscription an invoice bills, across the API versions that moved the field. */
function subscriptionOfInvoice(inv: Stripe.Invoice): string | null {
  const parent = (inv as Stripe.Invoice & { parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  if (fromParent) return typeof fromParent === "string" ? fromParent : fromParent.id;
  const legacy = (inv as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id;
  return null;
}

/** An attendee's purchase through a call-to-action overlay. */
async function completeCtaOrder(admin: ReturnType<typeof supabaseAdmin>, cs: Stripe.Checkout.Session) {
  await admin
    .from("orders")
    .update({ status: "paid", amount_total: cs.amount_total, currency: cs.currency, updated_at: new Date().toISOString() })
    .eq("stripe_session_id", cs.id);
  const m = cs.metadata ?? {};
  if (m.run_id && m.session_id && m.user_id) {
    const { data: session } = await admin.from("sessions").select("started_at, created_at").eq("id", m.session_id).maybeSingle();
    const offset = session ? Math.max(0, Math.round((Date.now() - new Date(session.started_at ?? session.created_at).getTime()) / 1000)) : 0;
    await admin.from("cta_events").insert({
      org_id: m.org_id,
      session_id: m.session_id,
      run_id: m.run_id,
      user_id: m.user_id,
      offset_seconds: offset,
      action: "conversion",
    });
  }
}
