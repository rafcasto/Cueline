"use client";
import { useEffect, useRef, useState } from "react";
import { createCueScheduler } from "@/lib/latency";
import { subscribeSession } from "@/lib/realtime";
import { emptyState, fromSnapshot, reduce, type SessionState } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { SessionBroadcast, SlideEvent } from "@/lib/supabase/types";

type Options = {
  /** Viewers pass the player's live-edge latency so cues land with the slide. Hosts pass nothing. */
  getLatencyMs?: () => number;
  /** Host panel wants everything; viewers only see approved questions and their own roster row. */
  host?: boolean;
};

export function useSession(sessionId: string | null, opts: Options = {}) {
  const [state, setState] = useState<SessionState>(emptyState);
  const [status, setStatus] = useState<string>("idle");
  const latencyRef = useRef(opts.getLatencyMs);
  useEffect(() => {
    latencyRef.current = opts.getLatencyMs;
  });

  useEffect(() => {
    if (!sessionId) return;
    const sb = supabaseBrowser();
    let cancelled = false;
    const scheduler = createCueScheduler(() => latencyRef.current?.() ?? 0);

    const apply = (m: SessionBroadcast) => {
      // Slide events are the only messages that must wait for the HLS delay;
      // tallies and questions can land as soon as they arrive.
      if (m.payload.table === "slide_events" && m.payload.operation === "INSERT" && latencyRef.current) {
        const ev = m.payload.record as unknown as SlideEvent;
        scheduler.schedule(ev.id, ev.server_ts, () => setState((s) => reduce(s, m)));
        return;
      }
      setState((s) => reduce(s, m));
    };

    (async () => {
      const [polls, options, tallies, ctas, questions, votes, hands, roster, last] = await Promise.all([
        sb.from("polls").select("*").eq("session_id", sessionId),
        sb.from("poll_options").select("*").eq("session_id", sessionId),
        sb.from("poll_tallies").select("poll_id, option_id, votes").eq("session_id", sessionId),
        sb.from("ctas").select("*").eq("session_id", sessionId),
        sb.from("questions").select("*").eq("session_id", sessionId),
        sb.from("question_votes").select("question_id").eq("session_id", sessionId),
        sb.from("hand_raises").select("*").eq("session_id", sessionId).is("cleared_at", null),
        sb.from("stage_roster").select("*").eq("session_id", sessionId),
        sb.from("slide_events").select("*").eq("session_id", sessionId).order("server_ts", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setState(
        fromSnapshot({
          polls: polls.data ?? [],
          options: options.data ?? [],
          tallies: tallies.data ?? [],
          ctas: ctas.data ?? [],
          questions: questions.data ?? [],
          questionVotes: votes.data ?? [],
          handRaises: hands.data ?? [],
          roster: roster.data ?? [],
          lastSlide: last.data ?? null,
        }),
      );
    })();

    const unsubscribe = subscribeSession(sb, sessionId, apply, setStatus);
    return () => {
      cancelled = true;
      scheduler.clear();
      unsubscribe();
    };
  }, [sessionId]);

  return { state, status };
}
