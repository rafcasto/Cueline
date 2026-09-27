"use client";
import Hls from "hls.js";
import { useEffect, useRef } from "react";
import { clampLatency } from "@/lib/latency";

type Props = {
  src: string | null;
  /** Called whenever the player's live-edge latency estimate changes. */
  onLatency?: (ms: number) => void;
  className?: string;
};

/** Broadcast-only viewer: an HLS player and nothing else. No WebRTC socket is opened. */
export function HlsPlayer({ src, onLatency, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const latencyRef = useRef(onLatency);
  useEffect(() => {
    latencyRef.current = onLatency;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 6 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined));
      const t = setInterval(() => latencyRef.current?.(clampLatency(hls.latency * 1000)), 1000);
      return () => {
        clearInterval(t);
        hls.destroy();
      };
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari: native HLS. No latency API, so fall back to a typical live-edge distance.
      video.src = src;
      const t = setInterval(() => latencyRef.current?.(clampLatency(undefined)), 1000);
      return () => clearInterval(t);
    }
  }, [src]);

  return (
    <video ref={videoRef} className={className} controls playsInline autoPlay muted={false}>
      {!src && "Waiting for the stream to start…"}
    </video>
  );
}
