import { handler, json, readJson, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { cta_id: string; cta_event_id: string; room_slug: string };

/** Stripe Embedded Checkout inside the panel: returns the client secret; the webhook writes orders. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: cta } = await admin.from("ctas").select("*").eq("id", body.cta_id).maybeSingle();
  if (!cta || cta.destination !== "stripe") return json({ error: "not a Stripe CTA" }, { status: 400 });

  const checkout = await stripe().checkout.sessions.create({
    ui_mode: "embedded",
    mode: "payment",
    line_items: [{ price: cta.target, quantity: 1 }],
    return_url: `${publicEnv.appUrl}/r/${encodeURIComponent(body.room_slug)}?checkout={CHECKOUT_SESSION_ID}`,
    metadata: { org_id: cta.org_id, session_id: cta.session_id, cta_id: cta.id, cta_event_id: body.cta_event_id, user_id: user.id },
  });

  const { error } = await admin.from("orders").insert({
    org_id: cta.org_id,
    session_id: cta.session_id,
    cta_event_id: body.cta_event_id,
    stripe_session_id: checkout.id,
    status: "pending",
  });
  if (error) throw error;

  return json({ client_secret: checkout.client_secret });
});
