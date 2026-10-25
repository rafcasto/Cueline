"use client";
import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner, cx } from "@/components/ui";
import { clampLatency } from "@/lib/latency";

type Props = {
  src: string | null;
  /** Called every second with the player's live-edge latency estimate; 0 while nothing is playing. */
  onLatency?: (ms: number) => void;
  className?: string;
};

/** `on` has sound; `muted` means the browser refused sound until a tap; `blocked` means it refused to play at all. */
type Sound = "on" | "muted" | "blocked";

/** How long to wait before asking for the playlist again when it is missing or the stream dropped. */
const RETRY_MS = 3000;

/**
 * Broadcast-only viewer: an HLS player and nothing else. No WebRTC socket is opened.
 *
 * Two things used to leave attendees with a black box until they refreshed. The playlist
 * does not exist for the first seconds after "Go live" (egress is still starting), and
 * hls.js gives up after one retry, so the player now asks again every few seconds until it
 * is there, and again whenever the stream drops. And browsers refuse autoplay with sound
 * without a tap; the player then starts muted and offers "Tap for sound" instead of staying
 * silent and black. The latency reported upstream is 0 while nothing plays, so overlays are
 * not held back for a video that is not there.
 */
export function HlsPlayer({ src, onLatency, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const latencyRef = useRef(onLatency);
  // Which source has a parsed playlist; a new src is therefore "not ready" without a reset.
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const ready = !!src && readySrc === src;
  // Set after the playlist has failed to load, so the spinner can say which host it is waiting on.
  const [failing, setFailing] = useState<string | null>(null);
  const host = (() => {
    try {
      return src ? new URL(src).host : "";
    } catch {
      return "";
    }
  })();
  const [sound, setSound] = useState<Sound>("on");
  useEffect(() => {
    latencyRef.current = onLatency;
  });

  // Start with sound; fall back to muted; if even that is refused, wait for a tap.
  const play = useCallback(async (fromTap: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    try {
      await v.play();
      setSound("on");
      return;
    } catch {
      /* autoplay with sound refused */
    }
    v.muted = true;
    try {
      await v.play();
      setSound("muted");
    } catch {
      setSound(fromTap ? "muted" : "blocked");
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      latencyRef.current?.(0);
      return;
    }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const retryLater = (fn: () => void) => {
      if (disposed) return;
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => {
        retry = null;
        if (!disposed) fn();
      }, RETRY_MS);
    };
    const report = (latency: () => number | undefined) =>
      setInterval(() => {
        const playing = !video.paused && !video.ended && video.readyState >= 2;
        latencyRef.current?.(playing ? clampLatency(latency()) : 0);
      }, 1000);

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 6 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setReadySrc(src);
        setFailing(null);
        void play(false);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        // Network (playlist not there yet, or the stream dropped) and anything else: ask again shortly.
        console.warn("hls", data.details, data.response?.code ?? "");
        setReadySrc(null);
        setFailing(`${data.details}${data.response?.code ? ` (${data.response.code})` : ""}`);
        retryLater(() => hls.loadSource(src));
      });
      const t = report(() => hls.latency * 1000);
      return () => {
        disposed = true;
        if (retry) clearTimeout(retry);
        clearInterval(t);
        hls.destroy();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari: native HLS. No latency API, so fall back to a typical live-edge distance.
      const load = () => {
        video.src = src;
        video.load();
      };
      const onMeta = () => {
        setReadySrc(src);
        void play(false);
      };
      const onError = () => {
        setReadySrc(null);
        setFailing(video.error?.message || "could not load");
        retryLater(load);
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError);
      load();
      const t = report(() => undefined);
      return () => {
        disposed = true;
        if (retry) clearTimeout(retry);
        clearInterval(t);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        video.removeAttribute("src");
        video.load();
      };
    }
  }, [src, play]);

  // The native controls can unmute or start playback too; keep the sound state in step with the element.
  const sync = () => {
    const v = videoRef.current;
    if (!v || v.paused) return;
    setSound(v.muted ? "muted" : "on");
  };

  return (
    <div className={cx("relative overflow-hidden bg-black", className)}>
      <video ref={videoRef} className="h-full w-full" controls playsInline onPlaying={sync} onVolumeChange={sync} />
      {src && !ready && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-3 text-center text-xs text-slate-300">
          <Spinner className="size-5" />
          {failing ? (
            <>
              <span>Waiting for the stream from {host}…</span>
              <span className="text-[10px] text-slate-500">{failing}</span>
            </>
          ) : (
            "Connecting to the stream…"
          )}
        </div>
      )}
      {!src && <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-slate-400">Waiting for the stream to start…</p>}
      {ready && sound === "blocked" && (
        <button type="button" onClick={() => void play(true)} className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
          ▶ Tap to play
        </button>
      )}
      {ready && sound === "muted" && (
        <button
          type="button"
          onClick={() => void play(true)}
          className="absolute left-1/2 top-2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/30 backdrop-blur hover:bg-black/85"
        >
          🔇 Tap for sound
        </button>
      )}
    </div>
  );
}
