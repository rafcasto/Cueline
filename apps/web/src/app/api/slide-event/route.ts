import { handler, json, readJson, requireOrgRole, requireUser } from "@/lib/auth";
import { activeSessionForDeck, recordSlideEvent } from "@/lib/cues-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DeckSlide } from "@/lib/supabase/types";

type Body = { presentation_id: string; slide_object_id: string; client_ts?: number };

/**
 * Called by the Chrome extension every time the presented slide changes.
 * Validates the host, resolves the live session for that deck, looks up the cue
 * and inserts the slide_events row; the DB trigger broadcasts to viewers.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body.presentation_id || !body.slide_object_id) {
    return json({ error: "presentation_id and slide_object_id required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const session = await activeSessionForDeck(admin, body.presentation_id);
  if (!session) return json({ active: false });
  await requireOrgRole(user.id, session.org_id);

  const { data: slide } = await admin
    .from("deck_slides")
    .select("slide_object_id, index, poll_payload, cta_payload")
    .eq("presentation_id", body.presentation_id)
    .eq("slide_object_id", body.slide_object_id)
    .maybeSingle();

  const result = await recordSlideEvent(
    admin,
    session,
    (slide as Pick<DeckSlide, "slide_object_id" | "index" | "poll_payload" | "cta_payload"> | null) ?? {
      slide_object_id: body.slide_object_id,
      index: null,
      poll_payload: null,
      cta_payload: null,
    },
    { forced: false },
  );
  return json({ active: true, session_id: session.id, ...result });
});
