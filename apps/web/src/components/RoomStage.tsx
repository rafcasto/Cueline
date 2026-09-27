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
    (async () => {
      await r.connect(connection.url, connection.token);
      if (!active) return;
      setRoom(r);
      if (publish) {
        await r.localParticipant.enableCameraAndMicrophone();
        const cam = r.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (cam && localRef.current) cam.attach(localRef.current);
      }
    })().catch((err) => console.error("room connect failed", err));

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
      {!room && connection && <p className="text-sm text-neutral-500">Connecting…</p>}
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
