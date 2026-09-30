"use client";
import { useEffect, useRef, useState } from "react";
import { createCueScheduler } from "@/lib/latency";
import { subscribeSession } from "@/lib/realtime";
import { emptyState, fromSnapshot, reduce, type SessionData } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { ActivityRun, SessionBroadcast, SlideEvent } from "@/lib/supabase/types";

type Options = {
  /** Viewers pass the player's live-edge latency so slide changes and activations land with the video. Hosts pass nothing. */
  getLatencyMs?: () => number;
  /** The signed-in user, so the reducer can keep "my" responses. */
  userId?: string | null;
  roomId: string;
};

export function useSession(sessionId: string | null, opts: Options) {
  const [state, setState] = useState<SessionData>(emptyState);
  const [status, setStatus] = useState<string>("idle");
  const latencyRef = useRef(opts.getLatencyMs);
  const meRef = useRef(opts.userId ?? null);
  useEffect(() => {
    latencyRef.current = opts.getLatencyMs;
    meRef.current = opts.userId ?? null;
  });

  useEffect(() => {
    if (!sessionId) return;
    const sb = supabaseBrowser();
    let cancelled = false;
    const scheduler = createCueScheduler(() => latencyRef.current?.() ?? 0);

    const apply = (m: SessionBroadcast) => {
      // Slide changes and activity openings must wait for the HLS delay so they
      // arrive with the video; everything else lands immediately.
      const delayed =
        latencyRef.current &&
        m.payload.operation === "INSERT" &&
        (m.payload.table === "slide_events" || m.payload.table === "activity_runs");
      if (delayed) {
        const rec = m.payload.record as unknown as SlideEvent | ActivityRun;
        const ts = "server_ts" in rec ? rec.server_ts : rec.opened_at;
        scheduler.schedule(rec.id, ts, () => setState((s) => reduce(s, m, meRef.current)));
        return;
      }
      setState((s) => reduce(s, m, meRef.current));
    };

    (async () => {
      const me = meRef.current;
      const [session, activities, runs, tallies, mine, participants, questions, votes, hands, roster, last] = await Promise.all([
        sb.from("sessions").select("*").eq("id", sessionId).maybeSingle(),
        sb.from("activities").select("*").eq("room_id", opts.roomId).order("sort_order"),
        sb.from("activity_runs").select("*").eq("session_id", sessionId),
        sb.from("run_tallies").select("run_id, option_id, votes").eq("session_id", sessionId),
        me ? sb.from("activity_responses").select("*").eq("session_id", sessionId).eq("user_id", me) : Promise.resolve({ data: [] }),
        sb.from("participants").select("*").eq("session_id", sessionId),
        sb.from("questions").select("*").eq("session_id", sessionId),
        sb.from("question_votes").select("question_id").eq("session_id", sessionId),
        sb.from("hand_raises").select("*").eq("session_id", sessionId).is("cleared_at", null),
        sb.from("stage_roster").select("*").eq("session_id", sessionId),
        sb.from("slide_events").select("*").eq("session_id", sessionId).order("server_ts", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setState(
        fromSnapshot({
          session: session.data ?? null,
          activities: activities.data ?? [],
          runs: runs.data ?? [],
          tallies: tallies.data ?? [],
          myResponses: mine.data ?? [],
          participants: participants.data ?? [],
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
  }, [sessionId, opts.roomId]);

  return { state, status };
}

/** A ticking clock for countdowns. */
export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
