import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, env("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    return Response.json({ error: `bad signature: ${(err as Error).message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const cs = event.data.object;
    const admin = supabaseAdmin();
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
  } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    await supabaseAdmin()
      .from("orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("stripe_session_id", event.data.object.id);
  }

  return Response.json({ received: true });
}
