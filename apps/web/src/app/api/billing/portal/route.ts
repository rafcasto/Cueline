import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { activeStripeMode, isStripeMode, stripeFor } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { org_id: string };

/** Stripe's Customer Portal: invoices, card, cancel, switch plan. Opens in the mode the subscription lives in. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  await requireOrgRole(user.id, body.org_id, ["owner"]);
  const { data: org } = await supabaseAdmin().from("organisations").select("stripe_mode, stripe_customer_id").eq("id", body.org_id).maybeSingle();
  if (!org?.stripe_customer_id) return json({ error: "no billing account yet; buy a plan or a pass first" }, { status: 404 });
  const mode = isStripeMode(org.stripe_mode) ? org.stripe_mode : await activeStripeMode();
  const portal = await stripeFor(mode).billingPortal.sessions.create({
    customer: org.stripe_customer_id as string,
    return_url: `${publicEnv.appUrl.replace(/\/$/, "")}/host/billing`,
  });
  return json({ url: portal.url, mode });
});
