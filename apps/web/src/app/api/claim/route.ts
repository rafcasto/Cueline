import { handler, HttpError, json, readJson, requireUser } from "@/lib/auth";
import { registrationStatus } from "@/lib/seats";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { token?: string; email?: string; code?: string };

/**
 * Get back into a webinar you registered for, from any device: either the personal link
 * from the emails (/a/<token>) or email + join code typed at /join. Both re-bind the
 * registration to the caller's current anonymous identity, which is what /r/<slug> checks.
 * Someone on the waiting list, or who opted out, is sent to the event page, which says so.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  let q = admin.from("registrations").select("id, name, email, user_id, room_id, invite_id, waitlisted_at, cancelled_at, invites(token, title, starts_at), rooms(slug)");
  if (body.token) {
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(body.token)) throw new HttpError(404, "This link is not valid.");
    q = q.eq("access_token", body.token);
  } else {
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!email || code.length !== 6) throw new HttpError(400, "Enter the email you registered with and your 6-character code.");
    q = q.eq("email", email).eq("code", code);
  }
  const { data: reg } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!reg) throw new HttpError(404, body.token ? "This link is not valid. Ask the organiser for a new one." : "We could not find a registration with that email and code.");

  if (reg.user_id !== user.id) {
    const { error } = await admin.from("registrations").update({ user_id: user.id }).eq("id", reg.id);
    if (error) throw error;
  }
  const { data: session } = await admin.from("sessions").select("state").eq("room_id", reg.room_id).neq("state", "ended").maybeSingle();
  const invite = reg.invites as unknown as { token: string; title: string; starts_at: string | null } | null;
  return json({
    name: reg.name,
    status: registrationStatus(reg),
    room_slug: (reg.rooms as unknown as { slug: string } | null)?.slug ?? null,
    invite_token: invite?.token ?? null,
    title: invite?.title ?? null,
    starts_at: invite?.starts_at ?? null,
    session_state: session?.state ?? null,
  });
});
