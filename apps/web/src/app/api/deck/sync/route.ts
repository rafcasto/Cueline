import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { fetchPresentation, slidesToRows } from "@/lib/slides";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = { presentation_id: string; org_id: string; google_access_token: string };

/** Re-sync a deck's cues from the Slides API. Called on link, on session start and from the refresh button. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body.presentation_id || !body.org_id || !body.google_access_token) {
    return json({ error: "presentation_id, org_id and google_access_token required" }, { status: 400 });
  }
  await requireOrgRole(user.id, body.org_id);

  const presentation = await fetchPresentation(body.presentation_id, body.google_access_token);
  const { rows, errors, title } = slidesToRows(presentation, body.org_id);

  const admin = supabaseAdmin();
  const { error } = await admin.from("deck_slides").upsert(rows, { onConflict: "presentation_id,slide_object_id" });
  if (error) throw error;
  // Drop slides that no longer exist in the deck (index comes from Google, never a local counter).
  const keep = rows.map((r) => r.slide_object_id);
  if (keep.length) {
    await admin
      .from("deck_slides")
      .delete()
      .eq("presentation_id", body.presentation_id)
      .not("slide_object_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  }

  return json({
    title,
    slides: rows.length,
    cues: rows.filter((r) => r.poll_payload || r.cta_payload).length,
    errors,
  });
});
