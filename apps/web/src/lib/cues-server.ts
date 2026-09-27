/**
 * Turns a slide change into engagement rows. Shared by /api/slide-event (extension)
 * and /api/poll/replay (host panel), so a replay is exactly a forced slide event.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeckSlide, Session } from "@/lib/supabase/types";

const DEDUPE_WINDOW_MS = 5_000;

export async function recordSlideEvent(
  admin: SupabaseClient,
  session: Session,
  slide: Pick<DeckSlide, "slide_object_id" | "index" | "poll_payload" | "cta_payload"> | { slide_object_id: string; index: number | null; poll_payload: null; cta_payload: null },
  opts: { forced: boolean },
) {
  // Presenter view and audience window both report the same slide: dedupe by id.
  if (!opts.forced) {
    const { data: last } = await admin
      .from("slide_events")
      .select("slide_object_id, server_ts")
      .eq("session_id", session.id)
      .order("server_ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      last &&
      last.slide_object_id === slide.slide_object_id &&
      Date.now() - new Date(last.server_ts as string).getTime() < DEDUPE_WINDOW_MS
    ) {
      return { deduped: true as const };
    }
  }

  let pollId: string | null = null;
  let ctaId: string | null = null;

  if (slide.poll_payload) {
    // Reuse the poll opened for this slide in this session unless forced (replay = fresh poll).
    if (!opts.forced) {
      const { data: existing } = await admin
        .from("polls")
        .select("id")
        .eq("session_id", session.id)
        .eq("slide_object_id", slide.slide_object_id)
        .is("closed_at", null)
        .maybeSingle();
      pollId = existing?.id ?? null;
    }
    if (!pollId) {
      const payload = slide.poll_payload;
      const { data: poll, error } = await admin
        .from("polls")
        .insert({
          org_id: session.org_id,
          session_id: session.id,
          slide_object_id: slide.slide_object_id,
          kind: payload.kind,
          question: payload.question,
        })
        .select("id")
        .single();
      if (error) throw error;
      pollId = poll.id;
      if (payload.kind !== "text") {
        const { error: optErr } = await admin.from("poll_options").insert(
          payload.options.map((label, index) => ({
            org_id: session.org_id,
            session_id: session.id,
            poll_id: pollId,
            index,
            label,
          })),
        );
        if (optErr) throw optErr;
      }
    }
  }

  if (slide.cta_payload) {
    const { data: existing } = await admin
      .from("ctas")
      .select("id")
      .eq("session_id", session.id)
      .eq("slide_object_id", slide.slide_object_id)
      .maybeSingle();
    ctaId = existing?.id ?? null;
    if (!ctaId) {
      const c = slide.cta_payload;
      const { data: cta, error } = await admin
        .from("ctas")
        .insert({
          org_id: session.org_id,
          session_id: session.id,
          slide_object_id: slide.slide_object_id,
          label: c.label,
          destination: c.destination,
          target: c.target,
        })
        .select("id")
        .single();
      if (error) throw error;
      ctaId = cta.id;
    }
  }

  const { data: event, error } = await admin
    .from("slide_events")
    .insert({
      org_id: session.org_id,
      session_id: session.id,
      slide_object_id: slide.slide_object_id,
      index: slide.index,
      forced: opts.forced,
      poll_id: pollId,
      cta_id: ctaId,
    })
    .select("id, server_ts")
    .single();
  if (error) throw error;

  return { deduped: false as const, eventId: event.id as string, serverTs: event.server_ts as string, pollId, ctaId };
}

/** The live session for a deck, if any. */
export async function activeSessionForDeck(admin: SupabaseClient, presentationId: string) {
  const { data } = await admin
    .from("sessions")
    .select("*")
    .eq("presentation_id", presentationId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Session | null) ?? null;
}
