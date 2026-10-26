import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { roomAccess } from "@/lib/billing";
import { publicEnv } from "@/lib/env";
import { parseTopics } from "@/lib/explore";
import { isPriceLookup, PRICE_LOOKUPS } from "@/lib/plans";
import { slugify, uniqueSlug } from "@/lib/rooms";
import { activeStripeMode, priceIdFor, stripeFor } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { price: string; room_id?: string; org_id?: string; new_room?: { name?: string; topics?: unknown } };

/**
 * Hosted Checkout for a room's plan, in whichever Stripe mode is active. The plan belongs to
 * the room, so the subscription is made per room:
 *
 * - `room_id`: upgrade that room (its first subscription), or, when it already subscribes,
 *   open the Customer Portal's plan-change flow so one room never has two subscriptions.
 * - `new_room`: buy another room. The organisation must already have a paid room (a free room
 *   cannot sit next to another). The room is created now, marked unpaid and locked, and the
 *   webhook unlocks it when the payment is through; an abandoned checkout leaves it on the
 *   billing page with a "complete payment" button, or the host deletes it.
 *
 * Returns the URL to send the owner to; the webhook grants the plan when Stripe confirms.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!isPriceLookup(body.price)) throw new HttpError(400, "unknown price");
  const admin = supabaseAdmin();
  const mode = await activeStripeMode();
  const s = stripeFor(mode);
  const base = publicEnv.appUrl.replace(/\/$/, "");

  let roomId: string;
  let orgId: string;
  if (body.room_id) {
    const { data: room } = await admin.from("rooms").select("id, org_id, plan, plan_status, complimentary").eq("id", body.room_id).maybeSingle();
    if (!room) throw new HttpError(404, "Room not found.");
    await requireOrgRole(user.id, room.org_id, ["owner"]);
    if (room.complimentary) throw new HttpError(400, "This room is complimentary; it needs no plan.");
    roomId = room.id;
    orgId = room.org_id;
  } else if (body.org_id && body.new_room) {
    await requireOrgRole(user.id, body.org_id, ["owner"]);
    orgId = body.org_id;
    const name = String(body.new_room.name ?? "").trim();
    if (name.length < 1 || name.length > 80) throw new HttpError(400, "Room name must be 1 to 80 characters.");
    const topics = parseTopics(body.new_room.topics ?? []);
    if ("error" in topics) throw new HttpError(400, topics.error);
    const { data: rooms } = await admin.from("rooms").select("id, plan, plan_status, complimentary").eq("org_id", orgId);
    const count = (rooms ?? []).length;
    if (count > 0 && !(rooms ?? []).some((r) => roomAccess(r, count).paid || r.complimentary)) {
      throw new HttpError(402, "Your room is on the free plan, and a free room cannot sit next to another. Upgrade it first, then add rooms.");
    }
    const slugBase = slugify(name);
    const { data: taken } = await admin.from("rooms").select("slug").like("slug", `${slugBase}%`);
    const slug = uniqueSlug(slugBase, (taken ?? []).map((r) => r.slug));
    const { data: created, error } = await admin
      .from("rooms")
      .insert({ org_id: orgId, name, slug, topics: topics.topics, plan: PRICE_LOOKUPS[body.price], plan_status: "unpaid" })
      .select("id")
      .single();
    if (error) throw error;
    roomId = created.id;
  } else {
    throw new HttpError(400, "Say which room to upgrade (room_id) or describe the new room (org_id, new_room).");
  }

  const [{ data: org }, { data: sub }] = await Promise.all([
    admin.from("organisations").select("id, stripe_mode, stripe_customer_id").eq("id", orgId).maybeSingle(),
    admin.from("room_subscriptions").select("*").eq("room_id", roomId).maybeSingle(),
  ]);
  if (!org) throw new HttpError(404, "Organisation not found.");
  const sameModeCustomer = org.stripe_mode === mode && org.stripe_customer_id ? (org.stripe_customer_id as string) : null;

  if (sub?.stripe_subscription_id && sub.stripe_mode === mode && sameModeCustomer) {
    const { data: room } = await admin.from("rooms").select("plan_status").eq("id", roomId).single();
    if (room?.plan_status !== "canceled") {
      const portal = await s.billingPortal.sessions.create({
        customer: sameModeCustomer,
        return_url: `${base}/host/billing`,
        flow_data: { type: "subscription_update", subscription_update: { subscription: sub.stripe_subscription_id as string } },
      });
      return json({ url: portal.url, mode, portal: true });
    }
  }

  const priceId = await priceIdFor(mode, body.price);
  const cs = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(sameModeCustomer ? { customer: sameModeCustomer } : { customer_email: user.email ?? undefined }),
    client_reference_id: roomId,
    metadata: { kind: "plan", org_id: orgId, room_id: roomId },
    subscription_data: { metadata: { org_id: orgId, room_id: roomId } },
    allow_promotion_codes: true,
    success_url: `${base}/host/billing?checkout=success`,
    cancel_url: `${base}/host/billing?checkout=cancelled`,
  });
  // Remember which price was chosen, so an abandoned checkout can be completed from the billing page.
  await admin.from("room_subscriptions").upsert({ room_id: roomId, org_id: orgId, stripe_mode: mode, price_lookup: body.price }, { onConflict: "room_id" });
  return json({ url: cs.url, mode });
});
