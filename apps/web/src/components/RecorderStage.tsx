"use client";
import { useEffect, useRef, useState } from "react";
import { ActivityOverlay } from "@/components/ActivityOverlay";
import { LiveViewer, type Transport } from "@/components/LiveViewer";
import { PdfPage } from "@/components/PdfPage";
import { BrandScope } from "@/components/RoomBrand";
import { StageCanvas } from "@/components/StageCanvas";
import { useSession } from "@/hooks/useSession";
import { currentRun } from "@/lib/session-state";
import { normalizeStageLayout } from "@/lib/stage-layout";
import { publicUrl } from "@/lib/storage";
import { ensureViewerIdentity, supabaseBrowser } from "@/lib/supabase/browser";
import type { Presentation, Room, Session } from "@/lib/supabase/types";

type Props = { room: Room; session: Session; presentation: Presentation | null; recordKey: string };

/** How long to wait for the presenter's video before telling the egress to start anyway; the stage is on screen either way. */
const START_GRACE_MS = 8000;

/**
 * What the egress films: the attendee stage and nothing else, edge to edge at the egress
 * viewport (16:9). The same StageCanvas attendees get, with the deck page, the presenter
 * video where the session's layout puts it, and the activity overlay in its read-only form
 * (the count of answers, as the host sees it). It signs in anonymously like an attendee so
 * the room's tables and the session channel are readable, but takes no seat and sends
 * nothing. The egress waits for START_RECORDING on the console and closes on END_RECORDING.
 */
export function RecorderStage({ room, session: initialSession, presentation: initialPresentation, recordKey }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<Transport>("connecting");
  const { state } = useSession(initialSession.id, { userId, roomId: room.id, enabled: !!userId });
  const session = state.session ?? initialSession;

  useEffect(() => {
    void ensureViewerIdentity().then((s) => setUserId(s.user.id)).catch((err: Error) => setError(err.message));
  }, []);

  // The deck can change during the session; attendees fetch it the same way.
  const [presentation, setPresentation] = useState<Presentation | null>(initialPresentation);
  const presentationId = session.presentation_id;
  useEffect(() => {
    if (!userId || !presentationId || presentation?.id === presentationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser().from("presentations").select("*").eq("id", presentationId).maybeSingle();
      if (!cancelled && data) setPresentation(data as Presentation);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, presentationId, presentation?.id]);

  // Start once the stage has its state and the presenter's video, or after the grace period: a
  // host who is slow to join with camera is part of the session attendees saw too.
  const started = useRef(false);
  const loaded = !!state.session && state.session.state !== "ended";
  useEffect(() => {
    if (started.current || !loaded) return;
    const go = () => {
      if (started.current) return;
      started.current = true;
      console.log("START_RECORDING");
    };
    if (transport === "webrtc") return go();
    const t = setTimeout(go, START_GRACE_MS);
    return () => clearTimeout(t);
  }, [loaded, transport]);
  useEffect(() => {
    if (session.state === "ended") console.log("END_RECORDING");
  }, [session.state]);

  const run = currentRun(state);
  const activity = run ? state.activities[run.activity_id] : null;
  const pdfUrl = presentationId && presentation ? publicUrl("presentations", presentation.storage_path) : null;
  const pageIndex = state.lastSlide?.page_index ?? 0;

  return (
    <BrandScope branding={room.branding} className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      {error ? (
        <p className="p-6 text-center text-sm text-slate-300">{error}</p>
      ) : (
        <StageCanvas
          layout={normalizeStageLayout(session.layout)}
          slide={<PdfPage url={pdfUrl} pageIndex={pageIndex} className="aspect-video" />}
          video={<LiveViewer sessionId={session.id} ready={!!userId} hlsUrl={null} recorder={{ key: recordKey }} onTransport={setTransport} className="h-full w-full" />}
          className="max-h-screen w-full"
        >
          {run && activity && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
              <ActivityOverlay state={state} run={run} activity={activity} userId={null} roomSlug={room.slug} readOnly />
            </div>
          )}
        </StageCanvas>
      )}
    </BrandScope>
  );
}
