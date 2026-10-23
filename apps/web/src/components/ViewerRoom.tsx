"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityOverlay } from "@/components/ActivityOverlay";
import { HlsPlayer } from "@/components/HlsPlayer";
import { PdfPage } from "@/components/PdfPage";
import { Questions } from "@/components/Questions";
import { ReactionBar } from "@/components/ReactionBar";
import { RoomStage } from "@/components/RoomStage";
import { WaitingRoom } from "@/components/WaitingRoom";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { currentRun } from "@/lib/session-state";
import { publicUrl } from "@/lib/storage";
import { ensureViewerIdentity, supabaseBrowser } from "@/lib/supabase/browser";
import type { Presentation, ReactionKind, Room, Session } from "@/lib/supabase/types";

type Props = { room: Room; session: Session | null; presentation: Presentation | null; attendee: { name: string } };

/** Decks are readable only by signed-in users; anonymous identity is created client-side, so fetch here. */
function usePresentation(initial: Presentation | null, presentationId: string | null, userId: string | null) {
  const [presentation, setPresentation] = useState<Presentation | null>(initial);
  useEffect(() => {
    if (!userId || !presentationId) return;
    if (presentation?.id === presentationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser().from("presentations").select("*").eq("id", presentationId).maybeSingle();
      if (!cancelled && data) setPresentation(data as Presentation);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, presentationId, presentation?.id]);
  return presentationId ? presentation : null;
}

/**
 * The participant view. The page behind it has already checked registration, so the
 * attendee lands straight in the waiting room under their registered name; then the
 * deck page (rendered from the PDF) with the presenter video beside it, the activity
 * overlay on top, reactions and Q&A underneath.
 */
export function ViewerRoom({ room, session: initialSession, presentation: initialPresentation, attendee }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [joinedLocal, setJoinedLocal] = useState(false);
  const latency = useRef(3000);
  const { state, status } = useSession(initialSession?.id ?? null, { getLatencyMs: () => latency.current, userId, roomId: room.id });
  const session = state.session ?? initialSession;
  const presentation = usePresentation(initialPresentation, session?.presentation_id ?? null, userId);
  const [stage, setStage] = useState<{ url: string; token: string } | null>(null);
  const [handUp, setHandUp] = useState(false);

  useEffect(() => {
    void ensureViewerIdentity().then((s) => setUserId(s.user.id));
  }, []);

  const joined = joinedLocal || (!!userId && !!state.participants[userId]);
  const sb = supabaseBrowser();
  const sid = session?.id ?? "";

  // Take the seat as soon as there is an identity and an open session; the name comes from registration.
  useEffect(() => {
    if (!userId || !sid || joined || session?.state === "ended") return;
    (async () => {
      const { error } = await sb
        .from("participants")
        .upsert({ session_id: sid, user_id: userId, display_name: attendee.name }, { onConflict: "session_id,user_id" });
      if (!error) setJoinedLocal(true);
      else console.warn("join failed", error.message);
    })();
  }, [sb, userId, sid, joined, session?.state, attendee.name]);
  const myRoster = userId ? state.roster[userId]?.state ?? "viewer" : "viewer";

  // Promote-to-stage: pre-warm on `invited` (token + permission prompt), publish on `live`.
  useEffect(() => {
    if (!sid) return;
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
        const t = await api<{ url: string; token: string }>("/api/stage", { action: "token", session_id: sid });
        if (!cancelled && myRoster === "live") setStage(t);
      })().catch((err) => console.warn("stage token", err));
    }
    return () => {
      cancelled = true;
    };
  }, [myRoster, sid]);

  const ask = useCallback(async (body: string) => { if (userId) await sb.from("questions").insert({ session_id: sid, user_id: userId, body }); }, [sb, sid, userId]);
  const upvote = useCallback(async (question_id: string) => { if (userId) await sb.from("question_votes").insert({ session_id: sid, question_id, user_id: userId }); }, [sb, sid, userId]);
  const react = useCallback(async (kind: ReactionKind, count: number) => { await sb.rpc("bump_reaction", { p_session: sid, p_kind: kind, p_count: count }); }, [sb, sid]);
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

  const run = currentRun(state);
  const activity = run ? state.activities[run.activity_id] : null;
  const pdfUrl = presentation ? publicUrl("presentations", presentation.storage_path) : null;
  const pageIndex = state.lastSlide?.page_index ?? 0;

  if (!session || session.state === "ended") {
    return (
      <main className="mx-auto max-w-4xl p-4">
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <WaitingRoom config={room.waiting_room} className="mt-3">
          <p className="absolute bottom-3 right-3 rounded bg-black/50 px-2 py-1 text-xs">This webinar is not live right now.</p>
        </WaitingRoom>
      </main>
    );
  }

  if (session.state === "waiting") {
    return (
      <main className="mx-auto max-w-4xl p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{room.name}</h1>
          <span className="text-xs text-neutral-500">
            {joined ? `You are in as ${attendee.name}` : "Taking your seat…"} · {Object.keys(state.participants).length} waiting
          </span>
        </header>
        <WaitingRoom config={room.waiting_room} className="mt-3" />
        <div className="mt-3">
          <ReactionBar onFlush={react} lastReaction={state.lastReaction} disabled />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{room.name}</h1>
          <span className="text-xs text-neutral-500">
            {myRoster === "live" ? "On stage" : "Live"} · {Object.keys(state.participants).length} here · {status}
          </span>
        </header>

        <div className="relative">
          <PdfPage url={pdfUrl} pageIndex={pageIndex} className="aspect-video overflow-hidden rounded-xl" />
          <div className="absolute bottom-3 right-3 w-48 overflow-hidden rounded-lg shadow-lg sm:w-64">
            {myRoster === "live" && stage ? (
              <RoomStage connection={stage} publish onDisconnected={() => setStage(null)} />
            ) : (
              <HlsPlayer src={session.hls_url} onLatency={(ms) => (latency.current = ms)} className="aspect-video w-full bg-black" />
            )}
          </div>
          {run && activity && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <ActivityOverlay state={state} run={run} activity={activity} userId={userId} roomSlug={room.slug} />
            </div>
          )}
        </div>

        {myRoster === "invited" && (
          <p className="mt-2 rounded bg-indigo-50 p-2 text-sm text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            The host invited you on stage. Allow camera and microphone; you will go live when they confirm.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <ReactionBar onFlush={react} lastReaction={state.lastReaction} />
          <button onClick={() => void toggleHand()} className={`rounded-full border px-3 py-1 dark:border-neutral-700 ${handUp ? "bg-indigo-600 text-white" : ""}`}>
            ✋ {handUp ? "Lower hand" : "Raise hand"}
          </button>
        </div>
      </section>

      <aside className="space-y-3">
        <Questions state={state} userId={userId} onAsk={ask} onUpvote={upvote} />
      </aside>
    </main>
  );
}
