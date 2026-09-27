import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { recordSlideEvent } from "@/lib/cues-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DeckSlide, Session } from "@/lib/supabase/types";

type Body = { session_id: string; slide_object_id: string };

/** Manual override: re-run a slide's cue without touching the deck. Inserts a forced slide_events row. */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  const admin = supabaseAdmin();

  const { data: session } = await admin.from("sessions").select("*").eq("id", body.session_id).maybeSingle();
  if (!session || session.ended_at) return json({ error: "no live session" }, { status: 404 });
  await requireOrgRole(user.id, session.org_id);

  const { data: slide } = await admin
    .from("deck_slides")
    .select("slide_object_id, index, poll_payload, cta_payload")
    .eq("presentation_id", session.presentation_id)
    .eq("slide_object_id", body.slide_object_id)
    .maybeSingle();
  if (!slide) return json({ error: "slide not found in synced deck" }, { status: 404 });

  const result = await recordSlideEvent(admin, session as Session, slide as DeckSlide, { forced: true });
  return json(result);
});
