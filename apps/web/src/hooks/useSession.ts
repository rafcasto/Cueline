"use client";
import { useEffect, useRef, useState } from "react";
import { createCueScheduler } from "@/lib/latency";
import { subscribeSession } from "@/lib/realtime";
import { emptyState, fromSnapshot, reduce, withActivity, type SessionData, type Snapshot } from "@/lib/session-state";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityRun, SessionBroadcast, SlideEvent } from "@/lib/supabase/types";

type Options = {
  /** Viewers pass the player's live-edge latency so slide changes and activations land with the video. Hosts pass nothing. */
  getLatencyMs?: () => number;
  /** The signed-in user, so the reducer can keep "my" responses. */
  userId?: string | null;
  roomId: string;
  /**
   * Hold off until the caller has an identity. Viewers sign in anonymously after mount; the
   * private channel and most of the snapshot tables need that identity, so subscribing earlier
   * gets an empty room that only a refresh fixes.
   */
  enabled?: boolean;
};

/** How long to wait for the channel before loading the snapshot anyway, so a blocked websocket still shows the room. */
const SNAPSHOT_FALLBACK_MS = 4000;

type Client = ReturnType<typeof supabaseBrowser>;

async function loadSnapshot(sb: Client, sessionId: string, roomId: string, me: string | null): Promise<Snapshot> {
  const [session, activities, runs, tallies, mine, participants, questions, votes, chat, hands, roster, last] = await Promise.all([
    sb.from("sessions").select("*").eq("id", sessionId).maybeSingle(),
    sb.from("activities").select("*").eq("room_id", roomId).order("sort_order"),
    sb.from("activity_runs").select("*").eq("session_id", sessionId),
    sb.from("run_tallies").select("run_id, option_id, votes").eq("session_id", sessionId),
    me ? sb.from("activity_responses").select("*").eq("session_id", sessionId).eq("user_id", me) : Promise.resolve({ data: [] }),
    sb.from("participants").select("*").eq("session_id", sessionId),
    sb.from("questions").select("*").eq("session_id", sessionId),
    sb.from("question_votes").select("question_id").eq("session_id", sessionId),
    // The latest 200; the stream carries everything after the snapshot.
    sb.from("chat_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(200),
    sb.from("hand_raises").select("*").eq("session_id", sessionId).is("cleared_at", null),
    sb.from("stage_roster").select("*").eq("session_id", sessionId),
    sb.from("slide_events").select("*").eq("session_id", sessionId).order("server_ts", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    session: session.data ?? null,
    activities: activities.data ?? [],
    runs: runs.data ?? [],
    tallies: tallies.data ?? [],
    myResponses: mine.data ?? [],
    participants: participants.data ?? [],
    questions: questions.data ?? [],
    questionVotes: votes.data ?? [],
    chat: chat.data ?? [],
    handRaises: hands.data ?? [],
    roster: roster.data ?? [],
    lastSlide: last.data ?? null,
  };
}

/**
 * Activities are room-scoped and not on the session channel, so a run can name one the
 * snapshot never saw (created or edited while the viewer was already in the room). Fetch it
 * with the run so the overlay always has the current question and options.
 */
async function loadActivity(sb: Client, id: string): Promise<Activity | null> {
  const { data } = await sb.from("activities").select("*").eq("id", id).maybeSingle();
  return (data as Activity | null) ?? null;
}

export function useSession(sessionId: string | null, opts: Options) {
  const [state, setState] = useState<SessionData>(emptyState);
  const [status, setStatus] = useState<string>("idle");
  const latencyRef = useRef(opts.getLatencyMs);
  const meRef = useRef(opts.userId ?? null);
  useEffect(() => {
    latencyRef.current = opts.getLatencyMs;
    meRef.current = opts.userId ?? null;
  });
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!sessionId || !enabled) return;
    const sb = supabaseBrowser();
    let cancelled = false;
    const scheduler = createCueScheduler(() => latencyRef.current?.() ?? 0);

    // Messages that arrive while a snapshot is loading are replayed on top of it, so nothing
    // written in that window is lost or applied to the state the snapshot then replaces.
    let loading = false;
    let loaded = false;
    let reloadAfter = false;
    let queued: SessionBroadcast[] = [];

    const dispatch = (m: SessionBroadcast) => {
      const { operation, table, record } = m.payload;
      if (operation === "INSERT" && table === "activity_runs" && record) {
        const run = record as unknown as ActivityRun;
        const activity = loadActivity(sb, run.activity_id);
        const commit = () =>
          void activity.then((a) => {
            if (cancelled) return;
            setState((s) => reduce(a ? withActivity(s, a) : s, m, meRef.current));
          });
        // Openings wait for the HLS delay so they land with the video; the fetch runs meanwhile.
        if (latencyRef.current) scheduler.schedule(run.id, run.opened_at, commit);
        else commit();
        return;
      }
      if (operation === "INSERT" && table === "slide_events" && record && latencyRef.current) {
        const slide = record as unknown as SlideEvent;
        scheduler.schedule(slide.id, slide.server_ts, () => setState((s) => reduce(s, m, meRef.current)));
        return;
      }
      setState((s) => reduce(s, m, meRef.current));
    };

    const apply = (m: SessionBroadcast) => {
      if (loading) queued.push(m);
      else dispatch(m);
    };

    const load = async () => {
      if (loading) {
        reloadAfter = true;
        return;
      }
      loading = true;
      queued = [];
      try {
        const snapshot = await loadSnapshot(sb, sessionId, opts.roomId, meRef.current);
        if (cancelled) return;
        setState(fromSnapshot(snapshot));
        loaded = true;
      } catch (err) {
        console.warn("session snapshot", err);
      } finally {
        loading = false;
      }
      if (cancelled) return;
      const pending = queued;
      queued = [];
      for (const m of pending) dispatch(m);
      if (reloadAfter) {
        reloadAfter = false;
        void load();
      }
    };

    // The snapshot is taken once the channel is up, so nothing falls between the two; it is
    // taken again after every reconnect, since broadcasts missed while offline never replay.
    const fallback = setTimeout(() => {
      if (!loaded && !loading) void load();
    }, SNAPSHOT_FALLBACK_MS);
    const unsubscribe = subscribeSession(sb, sessionId, apply, (s) => {
      if (cancelled) return;
      setStatus(s);
      if (s === "SUBSCRIBED") void load();
    });
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      scheduler.clear();
      unsubscribe();
    };
  }, [sessionId, opts.roomId, enabled]);

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
