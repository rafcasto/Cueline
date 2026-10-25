"use client";
import { DisconnectReason, RemoteTrack, Room, RoomEvent, Track, type RemoteTrackPublication, type RemoteParticipant } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { Spinner, cx } from "@/components/ui";

type Props = {
  /** Publish token + URL from /api/token (presenters) or /api/stage (promoted viewers). */
  connection: { url: string; token: string } | null;
  publish: boolean;
  onDisconnected?: (reason?: DisconnectReason) => void;
  /** Where to put a camera or connection problem instead of over the video (the host panel shows it in its alert). */
  onError?: (message: string) => void;
  className?: string;
};

/**
 * WebRTC leg: presenters and promoted viewers. Connects to the room, publishes
 * camera + mic when allowed, and renders every video track (the local camera first) in a
 * grid that fills whatever box the stage layout gives it.
 */
export function RoomStage({ connection, publish, onDisconnected, onError, className }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [remote, setRemote] = useState<Map<string, RemoteTrack>>(new Map());
  // Keyed by connection so a fresh token starts clean without a reset inside the effect.
  const [failure, setFailure] = useState<{ connection: Props["connection"]; message: string } | null>(null);
  const error = failure && failure.connection === connection ? failure.message : null;
  const localRef = useRef<HTMLVideoElement>(null);
  const disconnectedRef = useRef(onDisconnected);
  const errorRef = useRef(onError);
  useEffect(() => {
    disconnectedRef.current = onDisconnected;
    errorRef.current = onError;
  });

  useEffect(() => {
    if (!connection) return;
    const r = new Room({ adaptiveStream: true, dynacast: true });
    const onTrack = (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) =>
      setRemote((m) => new Map(m).set(`${p.identity}:${track.sid}`, track));
    const offTrack = (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) =>
      setRemote((m) => {
        const n = new Map(m);
        n.delete(`${p.identity}:${track.sid}`);
        return n;
      });
    r.on(RoomEvent.TrackSubscribed, onTrack);
    r.on(RoomEvent.TrackUnsubscribed, offTrack);
    r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (reason !== undefined && reason !== DisconnectReason.CLIENT_INITIATED) console.warn("room disconnected:", DisconnectReason[reason]);
      disconnectedRef.current?.(reason);
    });

    let active = true;
    const setError = (message: string) => {
      if (errorRef.current) errorRef.current(message);
      else setFailure({ connection, message });
    };
    (async () => {
      await r.connect(connection.url, connection.token);
      if (!active) return;
      setRoom(r);
      if (publish) {
        // Publish what the browser allows: a blocked microphone must not take the camera down with it (or the reverse).
        const problems: string[] = [];
        await r.localParticipant.setCameraEnabled(true).catch((err: Error) => problems.push(`camera: ${err.message}`));
        await r.localParticipant.setMicrophoneEnabled(true).catch((err: Error) => problems.push(`microphone: ${err.message}`));
        if (!active) return;
        if (problems.length) setError(`Could not start ${problems.join("; ")}. Check the browser's permission for this site and the selected device, then rejoin.`);
        const cam = r.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (cam && localRef.current) cam.attach(localRef.current);
      }
    })().catch((err: Error) => {
      console.error("room connect failed", err);
      if (active) setError(`Could not connect to the video room: ${err.message}`);
    });

    return () => {
      active = false;
      void r.disconnect();
      setRoom(null);
      setRemote(new Map());
    };
  }, [connection, publish]);

  const remoteVideos = [...remote.entries()].filter(([, t]) => t.kind === Track.Kind.Video).length;
  const tiles = (publish ? 1 : 0) + remoteVideos;
  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-black", className)}>
      <div className={cx("grid h-full w-full auto-rows-fr gap-px", tiles > 1 && "grid-cols-2")}>
        {publish && <video ref={localRef} autoPlay muted playsInline className="h-full w-full bg-black object-cover [transform:scaleX(-1)]" />}
        {[...remote.entries()].map(([key, track]) => (
          <TrackView key={key} track={track} />
        ))}
      </div>
      {!room && connection && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-3 text-center text-xs text-slate-300">
          <Spinner className="size-5" />
          Connecting…
        </div>
      )}
      {error && <p className="absolute inset-x-0 bottom-0 bg-red-700/90 px-3 py-1.5 text-center text-xs leading-snug text-white">{error}</p>}
    </div>
  );
}

/** One remote track: a video tile that fills its cell, or an audio element with no UI. Shared with the audience view. */
export function TrackView({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  if (track.kind === Track.Kind.Audio) return <audio ref={ref} autoPlay />;
  return <video ref={ref} autoPlay playsInline className="h-full w-full bg-black object-cover" />;
}
