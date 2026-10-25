import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { PRICE_LOOKUPS, isPriceLookup } from "@/lib/plans";
import { activeStripeMode, priceIdFor, stripeFor } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { org_id: string; price: string; invite_id?: string | null };

/**
 * Hosted Checkout for a plan or an event pass, in whichever Stripe mode is active. Returns the
 * URL to send the owner to; the webhook grants the plan or the pass when Stripe confirms. An
 * organisation that already subscribes changes plan in the Customer Portal instead, so one
 * organisation never ends up with two subscriptions.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!isPriceLookup(body.price)) return json({ error: "unknown price" }, { status: 400 });
  await requireOrgRole(user.id, body.org_id, ["owner"]);
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("organisations").select("*").eq("id", body.org_id).maybeSingle();
  if (!org) return json({ error: "organisation not found" }, { status: 404 });

  const mode = await activeStripeMode();
  const s = stripeFor(mode);
  const priceId = await priceIdFor(mode, body.price);
  const sameModeCustomer = org.stripe_mode === mode && org.stripe_customer_id ? (org.stripe_customer_id as string) : null;
  const base = publicEnv.appUrl.replace(/\/$/, "");

  if (PRICE_LOOKUPS[body.price] === "event_pass") {
    const cs = await s.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(sameModeCustomer ? { customer: sameModeCustomer } : { customer_email: user.email ?? undefined, customer_creation: "always" }),
      client_reference_id: org.id,
      metadata: { kind: "event_pass", org_id: org.id, invite_id: body.invite_id ?? "" },
      allow_promotion_codes: true,
      success_url: `${base}/host/billing?purchase=pass`,
      cancel_url: `${base}/host/billing?purchase=cancelled`,
    });
    const { error } = await admin.from("event_passes").insert({
      org_id: org.id,
      invite_id: body.invite_id ?? null,
      stripe_mode: mode,
      stripe_session_id: cs.id,
      status: "pending",
    });
    if (error) throw error;
    return json({ url: cs.url, mode });
  }

  if (org.stripe_subscription_id && org.plan_status !== "canceled" && org.stripe_mode === mode && sameModeCustomer) {
    const portal = await s.billingPortal.sessions.create({
      customer: sameModeCustomer,
      return_url: `${base}/host/billing`,
      flow_data: { type: "subscription_update", subscription_update: { subscription: org.stripe_subscription_id as string } },
    });
    return json({ url: portal.url, mode, portal: true });
  }

  const cs = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(sameModeCustomer ? { customer: sameModeCustomer } : { customer_email: user.email ?? undefined }),
    client_reference_id: org.id,
    metadata: { kind: "plan", org_id: org.id },
    subscription_data: { metadata: { org_id: org.id } },
    allow_promotion_codes: true,
    success_url: `${base}/host/billing?checkout=success`,
    cancel_url: `${base}/host/billing?checkout=cancelled`,
  });
  return json({ url: cs.url, mode });
});
