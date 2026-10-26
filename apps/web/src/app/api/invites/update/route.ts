import { handler, HttpError, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { loadOrgPlan } from "@/lib/billing";
import { resyncInvite } from "@/lib/email/schedule";
import { parseCapacity } from "@/lib/seats";
import { promoteWaitlist } from "@/lib/seats-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Invite } from "@/lib/supabase/types";

type Body = { id: string; title?: string; description?: string | null; starts_at?: string | null; timezone?: string; is_public?: boolean; capacity?: unknown };

/**
 * Edit an event. A new start time moves every reminder that is already scheduled; more seats
 * are filled from the waiting list at once. Fewer seats unseat nobody: the event is simply
 * full until people opt out.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();
  const { data: invite } = await admin.from("invites").select("*").eq("id", body.id).maybeSingle();
  if (!invite) throw new HttpError(404, "Event not found.");
  await requireOrgRole(user.id, invite.org_id, ["owner", "host"]);

  const patch: Partial<Invite> = {};
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (t.length < 1 || t.length > 200) throw new HttpError(400, "Title must be 1 to 200 characters.");
    patch.title = t;
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.starts_at !== undefined) {
    if (body.starts_at !== null && Number.isNaN(Date.parse(body.starts_at))) throw new HttpError(400, "Start time is not a valid date.");
    patch.starts_at = body.starts_at;
  }
  if (body.is_public !== undefined) {
    if (typeof body.is_public !== "boolean") throw new HttpError(400, "is_public must be true or false.");
    patch.is_public = body.is_public;
  }
  if (body.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.timezone });
    } catch {
      throw new HttpError(400, "Unknown timezone.");
    }
    patch.timezone = body.timezone;
  }
  const planned = await loadOrgPlan(admin, invite.org_id);
  if (!planned) throw new HttpError(404, "Organisation not found.");
  if (body.capacity !== undefined) {
    const seats = parseCapacity(body.capacity, planned.limits);
    if ("error" in seats) throw new HttpError(400, seats.error);
    patch.capacity = seats.capacity;
  }
  const { data, error } = await admin.from("invites").update(patch).eq("id", invite.id).select("*").single();
  if (error) throw error;
  if (patch.starts_at !== undefined && patch.starts_at !== invite.starts_at) await resyncInvite(invite.id);
  if (patch.capacity !== undefined && patch.capacity !== invite.capacity) await promoteWaitlist(admin, data as Invite, planned.limits);
  return json({ invite: data as Invite });
});
