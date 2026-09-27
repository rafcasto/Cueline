"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CtaCard } from "@/components/CtaCard";
import { HlsPlayer } from "@/components/HlsPlayer";
import { PollCard } from "@/components/PollCard";
import { Questions } from "@/components/Questions";
import { ReactionBar } from "@/components/ReactionBar";
import { RoomStage } from "@/components/RoomStage";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { ensureViewerIdentity, supabaseBrowser } from "@/lib/supabase/browser";
import type { Room, Session } from "@/lib/supabase/types";

type Props = { room: Room; session: Session | null };

/**
 * The viewer room. Default mode is HLS only; a promoted viewer tears the player
 * down, joins the WebRTC room and publishes, then falls back to HLS on revoke.
 */
export function ViewerRoom({ room, session }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const latency = useRef(3000);
  const { state, status } = useSession(session?.id ?? null, { getLatencyMs: () => latency.current });
  const [stage, setStage] = useState<{ url: string; token: string } | null>(null);
  const [handUp, setHandUp] = useState(false);

  useEffect(() => {
    void ensureViewerIdentity().then((s) => setUserId(s.user.id));
  }, []);

  const myRoster = userId ? state.roster[userId]?.state ?? "viewer" : "viewer";

  // Promote-to-stage: pre-warm on `invited` (token + permission prompt), publish on `live`, drop on `revoked`.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    if (myRoster === "invited" || myRoster === "live") {
      (async () => {
        if (myRoster === "invited") {
          try {
            const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            media.getTracks().forEach((t) => t.stop());
          } catch {
            /* the publish step will surface the permission error */
          }
        }
        const t = await api<{ url: string; token: string }>("/api/stage", { action: "token", session_id: session.id });
        if (!cancelled && myRoster === "live") setStage(t);
      })().catch((err) => console.warn("stage token", err));
    }
    // On `revoked` the RoomStage below unmounts (it renders only while live), which disconnects the room.
    return () => {
      cancelled = true;
    };
  }, [myRoster, session]);

  const sb = supabaseBrowser();
  const sid = session?.id ?? "";
  const vote = useCallback(
    async (pollId: string, optionIds: string[]) => {
      if (!userId) return;
      await sb.from("poll_responses").insert({ session_id: sid, poll_id: pollId, user_id: userId, option_ids: optionIds });
    },
    [sb, sid, userId],
  );
  const text = useCallback(
    async (pollId: string, answer: string) => {
      if (!userId) return;
      await sb.from("poll_responses").insert({ session_id: sid, poll_id: pollId, user_id: userId, text_answer: answer });
    },
    [sb, sid, userId],
  );
  const ask = useCallback(async (body: string) => {
    if (!userId) return;
    await sb.from("questions").insert({ session_id: sid, user_id: userId, body });
  }, [sb, sid, userId]);
  const upvote = useCallback(async (question_id: string) => {
    if (!userId) return;
    await sb.from("question_votes").insert({ session_id: sid, question_id, user_id: userId });
  }, [sb, sid, userId]);
  const react = useCallback(async (kind: string, count: number) => {
    await sb.rpc("bump_reaction", { p_session: sid, p_kind: kind, p_count: count });
  }, [sb, sid]);
  const toggleHand = useCallback(async () => {
    if (!userId) return;
    if (handUp) {
      await sb.from("hand_raises").update({ cleared_at: new Date().toISOString() }).eq("session_id", sid).eq("user_id", userId).is("cleared_at", null);
      setHandUp(false);
    } else {
      await sb.from("hand_raises").insert({ session_id: sid, user_id: userId });
      setHandUp(true);
    }
  }, [sb, sid, userId, handUp]);

  const activePoll = state.activePollId ? state.polls[state.activePollId] : null;
  const activeCta = state.activeCtaId ? state.ctas[state.activeCtaId] : null;
  const slideId = state.lastSlide?.slide_object_id ?? null;
  const panelOpen = useMemo(() => !!(activePoll || activeCta), [activePoll, activeCta]);

  if (!session) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">{room.name}</h1>
        <p className="mt-4 text-neutral-500">This room is not live right now.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{room.name}</h1>
          <span className="text-xs text-neutral-500">{myRoster === "live" ? "On stage" : `Live · ${status}`}</span>
        </header>
        {myRoster === "live" && stage ? (
          <RoomStage connection={stage} publish onDisconnected={() => setStage(null)} />
        ) : (
          <HlsPlayer src={session.hls_url} onLatency={(ms) => (latency.current = ms)} className="aspect-video w-full rounded bg-black" />
        )}
        {myRoster === "invited" && (
          <p className="mt-2 rounded bg-indigo-50 p-2 text-sm text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            The host invited you on stage. Allow camera and microphone; you will go live when they confirm.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ReactionBar onFlush={react} counts={state.reactions} />
          <button onClick={() => void toggleHand()} className={`rounded-full border px-3 py-1 ${handUp ? "bg-indigo-600 text-white" : ""}`}>
            ✋ {handUp ? "Lower hand" : "Raise hand"}
          </button>
        </div>
      </section>

      <aside className={`space-y-3 transition-transform ${panelOpen ? "translate-x-0" : ""}`}>
        {activePoll && (
          <PollCard poll={activePoll} state={state} userId={userId} onVote={(ids) => vote(activePoll.id, ids)} onText={(a) => text(activePoll.id, a)} />
        )}
        {activeCta && <CtaCard cta={activeCta} sessionId={session.id} roomSlug={room.slug} slideId={slideId} />}
        <Questions state={state} userId={userId} onAsk={ask} onUpvote={upvote} />
      </aside>
    </main>
  );
}
