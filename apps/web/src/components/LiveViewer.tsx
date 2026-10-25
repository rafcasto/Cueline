"use client";
import { DisconnectReason, RemoteTrack, Room, RoomEvent, type RemoteParticipant, type RemoteTrackPublication } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { HlsPlayer } from "@/components/HlsPlayer";
import { TrackView } from "@/components/RoomStage";
import { Spinner, cx } from "@/components/ui";
import { api } from "@/lib/api";

type Props = {
  sessionId: string;
  /** False until the participant has an identity; the token route needs one. */
  ready: boolean;
  /** Playlist from the session row, used when the room cannot take this participant. */
  hlsUrl: string | null;
  /** Called with the transport's live-edge latency: 0 over WebRTC, the player's estimate over HLS. */
  onLatency?: (ms: number) => void;
  className?: string;
};

type Transport = "connecting" | "webrtc" | "hls";

/** Room joins to try before giving up on WebRTC and watching the HLS fallback instead. */
const ATTEMPTS = 2;
const RETRY_MS = 3000;

/**
 * The audience's view of the presenters. Subscribe-only WebRTC: sub-second latency and
 * Opus with loss concealment, where the HLS leg sat 6-10 s behind and dropped audio on
 * every late segment. The HLS player stays as the fallback for a room that is full, a
 * network that blocks WebRTC, or a join that keeps failing; cues then wait for the
 * player's measured latency as before. A revoke removes the participant from the room
 * server-side; the client rejoins as a subscriber, which is why a disconnect retries
 * before it falls back.
 */
export function LiveViewer({ sessionId, ready, hlsUrl, onLatency, className }: Props) {
  const [transport, setTransport] = useState<Transport>("connecting");
  const [tracks, setTracks] = useState<Map<string, RemoteTrack>>(new Map());
  // Browsers refuse audio playback until the page has user activation; LiveKit reports it, and a tap fixes it.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const latencyRef = useRef(onLatency);
  useEffect(() => {
    latencyRef.current = onLatency;
  });
  useEffect(() => {
    if (transport !== "hls") latencyRef.current?.(0);
  }, [transport]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const key = (p: RemoteParticipant, track: RemoteTrack) => `${p.identity}:${track.sid}`;
    const retry = (why: string) => {
      if (!active) return;
      attempts++;
      console.warn(`room join ${attempts}/${ATTEMPTS} failed: ${why}`);
      setTracks(new Map());
      if (attempts >= ATTEMPTS) {
        setTransport("hls");
        return;
      }
      setTransport("connecting");
      timer = setTimeout(() => void connect(), RETRY_MS);
    };

    const connect = async () => {
      try {
        const t = await api<{ mode: string; url: string; token: string }>("/api/token", { session_id: sessionId, role: "viewer" });
        if (!active) return;
        if (t.mode !== "webrtc") {
          setTransport("hls");
          return;
        }
        const r = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = r;
        r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) =>
          setTracks((m) => new Map(m).set(key(p, track), track)),
        );
        r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) =>
          setTracks((m) => {
            const n = new Map(m);
            n.delete(key(p, track));
            return n;
          }),
        );
        r.on(RoomEvent.AudioPlaybackStatusChanged, () => setSoundBlocked(!r.canPlaybackAudio));
        r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (!active || reason === DisconnectReason.CLIENT_INITIATED) return;
          if (roomRef.current === r) roomRef.current = null;
          retry(`disconnected (${reason === undefined ? "unknown" : DisconnectReason[reason]})`);
        });
        await r.connect(t.url, t.token);
        if (!active) {
          void r.disconnect();
          return;
        }
        attempts = 0;
        setTransport("webrtc");
        setSoundBlocked(!r.canPlaybackAudio);
      } catch (err) {
        retry((err as Error).message);
      }
    };
    void connect();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      const r = roomRef.current;
      roomRef.current = null;
      if (r) void r.disconnect();
      setTracks(new Map());
      setTransport("connecting");
      setSoundBlocked(false);
    };
  }, [sessionId, ready]);

  if (transport === "hls") return <HlsPlayer src={hlsUrl} onLatency={onLatency} className={className} />;

  const list = [...tracks.entries()];
  const videos = list.filter(([, t]) => t.kind === "video").length;
  return (
    <div className={cx("relative overflow-hidden bg-black", className)}>
      <div className={cx("grid h-full w-full gap-px", videos > 1 && "grid-cols-2")}>
        {list.map(([k, track]) => (
          <TrackView key={k} track={track} />
        ))}
      </div>
      {videos === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-3 text-center text-xs text-slate-300">
          <Spinner className="size-5" />
          {transport === "webrtc" ? "Waiting for the presenter's camera…" : "Connecting to the stream…"}
        </div>
      )}
      {transport === "webrtc" && soundBlocked && (
        <button
          type="button"
          onClick={() => void roomRef.current?.startAudio().catch(() => undefined)}
          className="absolute left-1/2 top-2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/30 backdrop-blur hover:bg-black/85"
        >
          🔇 Tap for sound
        </button>
      )}
    </div>
  );
}
