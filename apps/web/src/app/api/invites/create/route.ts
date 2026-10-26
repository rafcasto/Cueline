import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { loadRoomAccess } from "@/lib/billing";
import { parseCapacity } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Invite } from "@/lib/supabase/types";

type Body = { room_id: string; title?: string; description?: string | null; starts_at?: string | null; timezone?: string; is_public?: boolean; capacity?: unknown };

/**
 * Create an event (an invite link) in a room. The seat count is checked against the room's
 * plan here, which is why events are created through the API rather than straight into the
 * table; left blank it means the plan's maximum. A locked room takes no new events. The room's
 * email sequence is copied by a trigger.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();
  const { data: room } = await admin.from("rooms").select("id, org_id, name").eq("id", body.room_id).maybeSingle();
  if (!room) throw new HttpError(404, "Room not found.");
  await requireOrgRole(user.id, room.org_id, ["owner", "host"]);
  const loaded = await loadRoomAccess(admin, room.id);
  if (!loaded) throw new HttpError(404, "Room not found.");
  if (loaded.access.locked) throw new HttpError(402, loaded.access.reason ?? "This room is locked.");

  const title = (body.title ?? "").trim() || room.name;
  if (title.length > 200) throw new HttpError(400, "Title must be 1 to 200 characters.");
  const description = body.description?.trim() || null;
  if (description && description.length > 2000) throw new HttpError(400, "Description must be 2000 characters or fewer.");
  const starts_at = body.starts_at ?? null;
  if (starts_at !== null && Number.isNaN(Date.parse(starts_at))) throw new HttpError(400, "Start time is not a valid date.");
  let timezone = "UTC";
  if (body.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timezone });
      timezone = body.timezone;
    } catch {
      throw new HttpError(400, "Unknown timezone.");
    }
  }
  const seats = parseCapacity(body.capacity, loaded.access.limits);
  if ("error" in seats) throw new HttpError(400, seats.error);

  const { data, error } = await admin
    .from("invites")
    .insert({ org_id: room.org_id, room_id: room.id, title, description, starts_at, timezone, created_by: user.id, is_public: body.is_public === true, capacity: seats.capacity })
    .select("*")
    .single();
  if (error) throw error;
  return json({ invite: data as Invite });
});
