import { handler, HttpError, isPlatformAdmin, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { parseBranding } from "@/lib/branding";
import { parseTopics } from "@/lib/explore";
import { cancelRoomEmails } from "@/lib/email/schedule";
import { SLUG_PATTERN, slugify, uniqueSlug } from "@/lib/rooms";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Room } from "@/lib/supabase/types";

type Body =
  | { action: "create"; org_id: string; name: string; topics?: unknown; description?: unknown }
  | { action: "update"; id: string; name?: string; slug?: string; branding?: unknown; chat_enabled?: unknown; is_public?: unknown; description?: unknown; topics?: unknown }
  | { action: "delete"; id: string };

/**
 * Rooms belong to the host's organisation. The plan belongs to the room: an organisation's
 * first room is created here, free; every room after it is bought on Starter or Pro through
 * `/api/billing/checkout`, which creates the room when the payment is through. Platform admins
 * create rooms freely, as complimentary rooms. Creating a room seeds its email sequence (a
 * database trigger); each room then carries its own events, deck, activities, waiting room and
 * emails, and the topics chosen at creation put it under the right filters on Explore. Deleting
 * a room cancels the reminders still scheduled for its registrants, then everything under it
 * cascades away. Branding (accent, logo, call to action) is validated here so a bad colour or a
 * non-http link never reaches attendees.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const cleanName = (name: string) => {
    const n = name.trim();
    if (n.length < 1 || n.length > 80) throw new HttpError(400, "Room name must be 1 to 80 characters.");
    return n;
  };

  if (body.action === "create") {
    await requireOrgRole(user.id, body.org_id, ["owner", "host"]);
    const name = cleanName(String(body.name ?? ""));
    const topics = parseTopics(body.topics ?? []);
    if ("error" in topics) throw new HttpError(400, topics.error);
    const description = body.description === undefined || body.description === null ? null : String(body.description).trim() || null;
    if (description && description.length > 600) throw new HttpError(400, "Description must be 600 characters or fewer.");

    const [platformAdmin, { data: existing }] = await Promise.all([isPlatformAdmin(user.id), admin.from("rooms").select("id, plan, plan_status, complimentary").eq("org_id", body.org_id)]);
    if (!platformAdmin && (existing ?? []).length > 0) {
      const anyPaid = (existing ?? []).some((r) => r.complimentary || (r.plan !== "free" && r.plan_status !== "canceled" && r.plan_status !== "unpaid"));
      throw new HttpError(
        402,
        anyPaid
          ? "Every room after the first is bought on Starter or Pro. Add a room from /host/billing."
          : "Your room is on the free plan, and a free room cannot sit next to another room. Upgrade it at /host/billing, then add rooms on Starter or Pro.",
      );
    }

    const base = slugify(name);
    const { data: taken } = await admin.from("rooms").select("slug").like("slug", `${base}%`);
    const slug = uniqueSlug(base, (taken ?? []).map((r) => r.slug));
    const { data, error } = await admin
      .from("rooms")
      .insert({ org_id: body.org_id, name, slug, topics: topics.topics, description, complimentary: platformAdmin })
      .select("*")
      .single();
    if (error) throw error;
    return json({ room: data as Room });
  }

  const { data: room } = await admin.from("rooms").select("*").eq("id", body.id).maybeSingle();
  if (!room) throw new HttpError(404, "Room not found.");
  await requireOrgRole(user.id, room.org_id, ["owner", "host"]);

  if (body.action === "delete") {
    const { data: open } = await admin.from("sessions").select("id").eq("room_id", room.id).neq("state", "ended").maybeSingle();
    if (open) throw new HttpError(409, "End the session before deleting the room.");
    const { data: sub } = await admin.from("room_subscriptions").select("stripe_subscription_id").eq("room_id", room.id).maybeSingle();
    if (sub?.stripe_subscription_id && room.plan_status !== "canceled") throw new HttpError(409, "This room has a subscription. Cancel it under Manage billing first, then delete the room.");
    await cancelRoomEmails(room.id);
    const { error } = await admin.from("rooms").delete().eq("id", room.id);
    if (error) throw error;
    return json({ ok: true });
  }

  const patch: Partial<Room> = {};
  if (body.name !== undefined) patch.name = cleanName(body.name);
  if (body.slug !== undefined) {
    const slug = body.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) throw new HttpError(400, "The address must be 3 to 40 characters: lowercase letters, digits and hyphens.");
    if (slug !== room.slug) {
      const { data: clash } = await admin.from("rooms").select("id").eq("slug", slug).maybeSingle();
      if (clash) throw new HttpError(409, "That address is already taken.");
      patch.slug = slug;
    }
  }
  if (body.chat_enabled !== undefined) {
    if (typeof body.chat_enabled !== "boolean") throw new HttpError(400, "chat_enabled must be true or false.");
    patch.chat_enabled = body.chat_enabled;
  }
  if (body.is_public !== undefined) {
    if (typeof body.is_public !== "boolean") throw new HttpError(400, "is_public must be true or false.");
    patch.is_public = body.is_public;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") throw new HttpError(400, "Description must be text.");
    const d = (body.description ?? "").trim();
    if (d.length > 600) throw new HttpError(400, "Description must be 600 characters or fewer.");
    patch.description = d || null;
  }
  if (body.topics !== undefined) {
    const parsed = parseTopics(body.topics);
    if ("error" in parsed) throw new HttpError(400, parsed.error);
    patch.topics = parsed.topics;
  }
  if (body.branding !== undefined) {
    const parsed = parseBranding(body.branding);
    if ("error" in parsed) throw new HttpError(400, parsed.error);
    patch.branding = parsed.branding;
  }
  if (Object.keys(patch).length === 0) return json({ room: room as Room });
  const { data, error } = await admin.from("rooms").update(patch).eq("id", room.id).select("*").single();
  if (error) throw error;
  return json({ room: data as Room });
});
