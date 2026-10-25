/**
 * Video vendor adapter. LiveKit Cloud today: token grants cover publish/subscribe,
 * room-composite egress covers both the HLS leg for viewers and the recording.
 * Keep every vendor call behind this module so Daily/100ms can be swapped in.
 */
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  RoomServiceClient,
  S3Upload,
  SegmentedFileOutput,
  SegmentedFileProtocol,
} from "livekit-server-sdk";
import { env } from "@/lib/env";

function httpUrl() {
  return env("LIVEKIT_URL").replace(/^wss?:\/\//, "https://");
}

function roomService() {
  return new RoomServiceClient(httpUrl(), env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"));
}

function egress() {
  return new EgressClient(httpUrl(), env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"));
}

function s3Output() {
  return new S3Upload({
    bucket: env("RECORDING_S3_BUCKET"),
    endpoint: process.env.RECORDING_S3_ENDPOINT ?? "",
    region: process.env.RECORDING_S3_REGION ?? "auto",
    accessKey: env("RECORDING_S3_ACCESS_KEY"),
    secret: env("RECORDING_S3_SECRET_KEY"),
    forcePathStyle: !!process.env.RECORDING_S3_ENDPOINT,
  });
}

export type TokenRole = "presenter" | "viewer";

/**
 * LiveKit creates a room when the first participant connects. Going live starts egress
 * before anyone has joined with a camera, so create the room explicitly first; createRoom
 * returns the existing room when there is one. The timeouts keep the room alive while the
 * host is between "Go live" and "Join with camera", and through a short reconnect.
 */
export async function ensureRoom(room: string) {
  await roomService().createRoom({ name: room, emptyTimeout: 60 * 60 * 4, departureTimeout: 60 * 10 });
}

/** Publish token for presenters and promoted viewers; subscribe-only otherwise. Short TTL, re-minted on demand. */
export async function mintRoomToken(opts: { room: string; identity: string; name?: string; role: TokenRole; ttlSeconds?: number }) {
  const at = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), {
    identity: opts.identity,
    name: opts.name,
    ttl: opts.ttlSeconds ?? 60 * 60 * 3,
  });
  const publish = opts.role === "presenter";
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: publish,
    canPublishData: publish,
    canSubscribe: true,
  });
  return { token: await at.toJwt(), url: env("LIVEKIT_URL") };
}

/** Server-side removal; the client falls back to HLS on disconnect. */
export async function removeFromRoom(room: string, identity: string) {
  try {
    await roomService().removeParticipant(room, identity);
  } catch (err) {
    // Roster state in Supabase is the source of truth; a vendor failure must not block the revoke.
    console.warn("removeParticipant failed", err);
  }
}

/**
 * Start the HLS leg: room-composite egress writing segments to object storage.
 * Returns the egress id and the public playlist URL viewers will play.
 */
export async function startHlsEgress(room: string, sessionId: string) {
  const prefix = `sessions/${sessionId}/live`;
  const output = new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix: `${prefix}/seg`,
    playlistName: `${prefix}/index.m3u8`,
    livePlaylistName: `${prefix}/live.m3u8`,
    segmentDuration: 2,
    output: { case: "s3", value: s3Output() },
  });
  const info = await egress().startRoomCompositeEgress(room, output, {
    layout: "speaker",
    encodingOptions: EncodingOptionsPreset.H264_720P_30,
  });
  const base = env("RECORDING_PUBLIC_BASE_URL").replace(/\/$/, "");
  return { egressId: info.egressId, hlsUrl: `${base}/${prefix}/live.m3u8` };
}

/**
 * Participants fetch the playlist from RECORDING_PUBLIC_BASE_URL, which has to be the bucket's
 * public URL (R2's r2.dev subdomain or a custom domain connected to it). A placeholder or a
 * domain with no DNS record gives every viewer a player that spins for ever, with nothing in
 * the host's panel to say why. So before egress starts, make one request to that host and
 * refuse to go live if it cannot be reached. Any HTTP status is fine; only a failed connection
 * (no DNS, refused, TLS) fails the check, so a bucket that answers 403 or 404 at its root passes.
 */
export async function checkPublicBase(): Promise<void> {
  const base = env("RECORDING_PUBLIC_BASE_URL").replace(/\/$/, "");
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return null;
    }
  })();
  if (!host) throw new Error(`RECORDING_PUBLIC_BASE_URL is not a URL: "${base}". Set it to the bucket's public URL, e.g. https://pub-xxxx.r2.dev.`);
  try {
    await fetch(`${base}/`, { method: "HEAD", signal: AbortSignal.timeout(8000) });
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
    const why = code === "ENOTFOUND" ? "has no DNS record" : `could not be reached (${code})`;
    throw new Error(`Cannot go live: RECORDING_PUBLIC_BASE_URL points at ${host}, which ${why}. Set it to the bucket's public URL (R2: bucket Settings, Public access) and redeploy.`);
  }
}

/** Recording: a single MP4 per session, next to the HLS segments. */
export async function startRecordingEgress(room: string, sessionId: string) {
  const filepath = `sessions/${sessionId}/recording.mp4`;
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: { case: "s3", value: s3Output() },
  });
  const info = await egress().startRoomCompositeEgress(room, output, {
    layout: "speaker",
    encodingOptions: EncodingOptionsPreset.H264_720P_30,
  });
  const base = env("RECORDING_PUBLIC_BASE_URL").replace(/\/$/, "");
  return { egressId: info.egressId, recordingUrl: `${base}/${filepath}` };
}

export async function stopEgress(egressId: string) {
  try {
    await egress().stopEgress(egressId);
  } catch (err) {
    console.warn("stopEgress failed", egressId, err);
  }
}
