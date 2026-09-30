import { handler, json, readJson, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { run_id: string; cta_event_id: string; room_slug: string };

/** Stripe Embedded Checkout inside the overlay: returns the client secret; the webhook writes orders. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: run } = await admin.from("activity_runs").select("id, org_id, session_id, activities(kind, config)").eq("id", body.run_id).maybeSingle();
  const activity = run?.activities as unknown as { kind: string; config: { destination?: string; target?: string } } | null;
  if (!run || !activity || activity.kind !== "cta" || activity.config.destination !== "stripe" || !activity.config.target) {
    return json({ error: "not a Stripe CTA" }, { status: 400 });
  }

  const checkout = await stripe().checkout.sessions.create({
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
    status: "pending",
  });
  if (error) throw error;

  return json({ client_secret: checkout.client_secret });
});
