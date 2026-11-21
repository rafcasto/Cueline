import { handler, json, readJson, requireUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { loadRoomAccess } from "@/lib/billing";
import { ctaButtons } from "@/lib/cta";
import { activeStripeMode, stripeFor, stripeKeys } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Activity } from "@/lib/supabase/types";

type Body = { run_id: string; cta_event_id: string; room_slug: string; button_index?: number };

/**
 * Stripe Embedded Checkout inside the overlay: returns the client secret; the webhook writes
 * orders. `button_index` says which button of the group was tapped; the first when absent.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: run } = await admin.from("activity_runs").select("id, org_id, session_id, activities(kind, config), sessions(room_id)").eq("id", body.run_id).maybeSingle();
  const activity = run?.activities as unknown as Pick<Activity, "kind" | "config"> | null;
  const button = activity?.kind === "cta" ? ctaButtons(activity)[Number.isInteger(body.button_index) ? (body.button_index as number) : 0] : undefined;
  if (!run || !button || button.destination !== "stripe" || !button.target) {
    return json({ error: "not a Stripe CTA" }, { status: 400 });
  }

  const roomId = (run.sessions as unknown as { room_id: string } | null)?.room_id;
  const loaded = roomId ? await loadRoomAccess(admin, roomId) : null;
  if (!loaded?.access.limits.stripeCta) {
    return json({ error: "Stripe call to action is a Pro feature" }, { status: 402 });
  }

  const mode = await activeStripeMode();
  const checkout = await stripeFor(mode).checkout.sessions.create({
    ui_mode: "embedded",
    mode: "payment",
    line_items: [{ price: button.target, quantity: 1 }],
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
