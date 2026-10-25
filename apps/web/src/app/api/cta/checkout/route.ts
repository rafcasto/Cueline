import { handler, json, readJson, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { planLimits } from "@/lib/plans";
import { activeStripeMode, stripeFor, stripeKeys } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { run_id: string; cta_event_id: string; room_slug: string };

/** Stripe Embedded Checkout inside the overlay: returns the client secret; the webhook writes orders. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: run } = await admin.from("activity_runs").select("id, org_id, session_id, activities(kind, config), organisations(plan, plan_status)").eq("id", body.run_id).maybeSingle();
  const activity = run?.activities as unknown as { kind: string; config: { destination?: string; target?: string } } | null;
  if (!run || !activity || activity.kind !== "cta" || activity.config.destination !== "stripe" || !activity.config.target) {
    return json({ error: "not a Stripe CTA" }, { status: 400 });
  }

  const org = run.organisations as unknown as { plan: string; plan_status: string } | null;
  if (!planLimits(org?.plan_status === "canceled" ? "free" : org?.plan).stripeCta) {
    return json({ error: "Stripe call to action is a Pro feature" }, { status: 402 });
  }

  const mode = await activeStripeMode();
  const checkout = await stripeFor(mode).checkout.sessions.create({
    ui_mode: "embedded",
    mode: "payment",
    line_items: [{ price: activity.config.target, quantity: 1 }],
    return_url: `${publicEnv.appUrl}/r/${encodeURIComponent(body.room_slug)}?checkout={CHECKOUT_SESSION_ID}`,
    metadata: { org_id: run.org_id, session_id: run.session_id, run_id: run.id, cta_event_id: body.cta_event_id, user_id: user.id },
  });

  const { error } = await admin.from("orders").insert({
    org_id: run.org_id,
    session_id: run.session_id,
    cta_event_id: body.cta_event_id,
    stripe_session_id: checkout.id,
    stripe_mode: mode,
    status: "pending",
  });
  if (error) throw error;

  return json({ client_secret: checkout.client_secret, publishable_key: stripeKeys(mode).publishable, mode });
});
