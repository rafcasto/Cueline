"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityOverlay } from "@/components/ActivityOverlay";
import { LiveViewer } from "@/components/LiveViewer";
import { PdfPage } from "@/components/PdfPage";
import { Questions } from "@/components/Questions";
import { ReactionBar } from "@/components/ReactionBar";
import { RoomStage } from "@/components/RoomStage";
import { WaitingRoom } from "@/components/WaitingRoom";
import { Alert, Badge, Button, Logo, cx } from "@/components/ui";
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
 * deck page (rendered from the PDF) with the presenter video (WebRTC, HLS fallback) beside it, the activity
 * overlay on top, reactions and Q&A underneath.
 */
export function ViewerRoom({ room, session: initialSession, presentation: initialPresentation, attendee }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [joinedLocal, setJoinedLocal] = useState(false);
  const [knownSession, setKnownSession] = useState<Session | null>(initialSession);
  // 0 over WebRTC and until the HLS fallback reports a live-edge distance; overlays are not held back for a video that is not playing.
  const latency = useRef(0);
  const { state, status } = useSession(knownSession?.id ?? null, { getLatencyMs: () => latency.current, userId, roomId: room.id, enabled: !!userId });
  const session = state.session ?? knownSession;

  // With no open session there is no channel to listen on, so "keep this page open" needs a poll for the next one.
  const openSession = !!session && session.state !== "ended";
  useEffect(() => {
    if (openSession || !userId) return;
    const sb = supabaseBrowser();
    const t = setInterval(async () => {
      const { data } = await sb.from("sessions").select("*").eq("room_id", room.id).neq("state", "ended").maybeSingle();
      if (data) setKnownSession(data as Session);
    }, 10_000);
    return () => clearInterval(t);
  }, [openSession, userId, room.id]);
  const presentation = usePresentation(initialPresentation, session?.presentation_id ?? null, userId);
  const [stage, setStage] = useState<{ url: string; token: string } | null>(null);
  const [handUp, setHandUp] = useState(false);

  useEffect(() => {
    void ensureViewerIdentity().then((s) => setUserId(s.user.id)).catch((err: Error) => setIdentityError(err.message));
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

  const here = Object.keys(state.participants).length;

  if (!session || session.state === "ended") {
    return (
      <RoomFrame title={room.name} status={<Badge>Not live</Badge>}>
        <WaitingRoom config={room.waiting_room} />
        <p className="mt-4 text-center text-sm text-ink-muted">This webinar is not live right now. Keep this page open, or come back with the link from your email.</p>
      </RoomFrame>
    );
  }

  if (session.state === "waiting") {
    return (
      <RoomFrame
        title={room.name}
        status={
          <>
            <span className="hidden text-xs text-ink-muted sm:inline">{joined ? `You are in as ${attendee.name}` : "Taking your seat…"}</span>
            <Badge tone="brand" dot>
              {here} waiting
            </Badge>
          </>
        }
      >
        <WaitingRoom config={room.waiting_room} withSound />
        {identityError && (
          <Alert tone="danger" className="mt-4">
            {identityError}
          </Alert>
        )}
        <p className="mt-4 text-center text-sm text-ink-muted">Doors are open. The host will start shortly.</p>
        <div className="mt-4 flex justify-center">
          <ReactionBar onFlush={react} lastReaction={state.lastReaction} disabled />
        </div>
      </RoomFrame>
    );
  }

  return (
    <RoomFrame
      wide
      title={room.name}
      status={
        <>
          <span className="hidden text-xs text-ink-faint lg:inline">{status}</span>
          <Badge tone="neutral">{here} here</Badge>
          <Badge tone={myRoster === "live" ? "success" : "live"} dot>
            {myRoster === "live" ? "On stage" : "Live"}
          </Badge>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
        <section>
          <div className="relative overflow-hidden rounded-xl border border-line bg-black shadow-float">
            <PdfPage url={pdfUrl} pageIndex={pageIndex} className="aspect-video" />
            <div className="absolute bottom-3 right-3 w-40 overflow-hidden rounded-lg shadow-overlay ring-1 ring-white/20 sm:w-56">
              {myRoster === "live" && stage ? (
                <RoomStage connection={stage} publish onDisconnected={() => setStage(null)} />
              ) : (
                <LiveViewer sessionId={session.id} ready={!!userId} hlsUrl={session.hls_url} onLatency={(ms) => (latency.current = ms)} className="aspect-video w-full bg-black" />
              )}
            </div>
            {run && activity && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <ActivityOverlay state={state} run={run} activity={activity} userId={userId} roomSlug={room.slug} />
              </div>
            )}
          </div>

          {myRoster === "invited" && (
            <Alert tone="brand" className="mt-4" title="The host invited you on stage">
              Allow camera and microphone when your browser asks; you go live when they confirm.
            </Alert>
          )}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <ReactionBar onFlush={react} lastReaction={state.lastReaction} />
            <Button variant={handUp ? "primary" : "secondary"} onClick={() => void toggleHand()} className={cx("rounded-full")}>
              <span aria-hidden>✋</span> {handUp ? "Lower hand" : "Raise hand"}
            </Button>
          </div>
        </section>

        <aside>
          <Questions state={state} userId={userId} onAsk={ask} onUpvote={upvote} />
        </aside>
      </div>
    </RoomFrame>
  );
}

/** Attendee chrome for the room: room name on the left, state on the right, nothing else. */
function RoomFrame({ title, status, wide, children }: { title: string; status: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  const width = wide ? "max-w-screen-2xl" : "max-w-4xl";
  return (
    <>
      <header className="border-b border-line bg-surface-raised">
        <div className={cx("mx-auto flex h-14 items-center justify-between gap-4 px-4 sm:px-6", width)}>
          <div className="flex min-w-0 items-center gap-3">
            <Logo wordmark={false} />
            <h1 className="truncate text-base font-semibold text-ink">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">{status}</div>
        </div>
      </header>
      <main className={cx("mx-auto w-full flex-1 px-4 py-6 sm:px-6", width)}>{children}</main>
    </>
  );
}
