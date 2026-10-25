"use client";
import { RemoteTrack, Room, RoomEvent, Track, type RemoteTrackPublication, type RemoteParticipant } from "livekit-client";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** Publish token + URL from /api/token (presenters) or /api/stage (promoted viewers). */
  connection: { url: string; token: string } | null;
  publish: boolean;
  onDisconnected?: () => void;
};

/**
 * WebRTC leg: presenters and promoted viewers. Connects to the room, publishes
 * camera + mic when allowed, and renders every remote video track.
 */
export function RoomStage({ connection, publish, onDisconnected }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [remote, setRemote] = useState<Map<string, RemoteTrack>>(new Map());
  // Keyed by connection so a fresh token starts clean without a reset inside the effect.
  const [failure, setFailure] = useState<{ connection: Props["connection"]; message: string } | null>(null);
  const error = failure && failure.connection === connection ? failure.message : null;
  const localRef = useRef<HTMLVideoElement>(null);
  const disconnectedRef = useRef(onDisconnected);
  useEffect(() => {
    disconnectedRef.current = onDisconnected;
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
    r.on(RoomEvent.Disconnected, () => disconnectedRef.current?.());

    let active = true;
    const setError = (message: string) => setFailure({ connection, message });
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

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {publish && <video ref={localRef} autoPlay muted playsInline className="aspect-video w-full rounded bg-black" />}
      {[...remote.entries()].map(([key, track]) => (
        <TrackView key={key} track={track} />
      ))}
      {!room && connection && !error && <p className="text-sm text-neutral-500">Connecting…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>}
    </div>
  );
}

function TrackView({ track }: { track: RemoteTrack }) {
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
  return <video ref={ref} autoPlay playsInline className="aspect-video w-full rounded bg-black" />;
}
