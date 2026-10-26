import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { EXTRA_ROOM } from "@/lib/plans";
import { activeStripeMode, priceIdFor, stripeFor } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { org_id: string };

/**
 * Buy one more room: a one-off Stripe Checkout (not part of the subscription) in whichever
 * mode is active. The purchase is recorded as pending; the webhook marks it paid and adds the
 * room to the organisation's allowance.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  await requireOrgRole(user.id, body.org_id, ["owner"]);
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("organisations").select("id, stripe_mode, stripe_customer_id").eq("id", body.org_id).maybeSingle();
  if (!org) throw new HttpError(404, "organisation not found");

  const mode = await activeStripeMode();
  const s = stripeFor(mode);
  const priceId = await priceIdFor(mode, EXTRA_ROOM.lookup);
  const sameModeCustomer = org.stripe_mode === mode && org.stripe_customer_id ? (org.stripe_customer_id as string) : null;
  const base = publicEnv.appUrl.replace(/\/$/, "");

  const cs = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(sameModeCustomer ? { customer: sameModeCustomer } : { customer_email: user.email ?? undefined, customer_creation: "always" }),
    client_reference_id: org.id,
    metadata: { kind: "room", org_id: org.id },
    success_url: `${base}/host/billing?checkout=room`,
    cancel_url: `${base}/host/billing?checkout=cancelled`,
  });
  const { error } = await admin.from("room_purchases").insert({ org_id: org.id, stripe_mode: mode, stripe_session_id: cs.id });
  if (error) throw error;
  return json({ url: cs.url, mode });
});
