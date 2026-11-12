/**
 * Video vendor adapter. LiveKit Cloud today: token grants cover publish (presenters, promoted
 * participants) and subscribe-only (everyone else, over WebRTC); one web egress per session
 * films the attendee stage (/record/[session]) and writes the recording and an HLS fallback.
 * Keep every vendor call behind this module so Daily/100ms can be swapped in.
 */
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
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
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, publicEnv } from "@/lib/env";

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

export type TokenRole = "presenter" | "viewer" | "recorder";

/**
 * LiveKit creates a room when the first participant connects. Going live starts egress
 * before anyone has joined with a camera, so create the room explicitly first; createRoom
 * returns the existing room when there is one. `maxParticipants` is the plan's audience cap
 * plus a margin for presenters; LiveKit refuses joins beyond it. The timeouts keep the room alive while the
 * host is between "Go live" and "Join with camera", and through a short reconnect.
 */
export async function ensureRoom(room: string, maxParticipants?: number) {
  await roomService().createRoom({ name: room, emptyTimeout: 60 * 60 * 4, departureTimeout: 60 * 10, ...(maxParticipants ? { maxParticipants } : {}) });
}

/** Publish token for presenters and promoted participants; subscribe-only for the audience. Short TTL, re-minted on demand. */
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
    // The audience (and the recorder) is hidden: not listed to presenters, and a join does not
    // fan a participant update out to every other participant in the room.
    hidden: !publish,
    recorder: opts.role === "recorder",
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
 * The page the egress films, with the key that lets it in. The key is an HMAC of the session
 * id under the LiveKit secret: the page has no cookie, so the key is what proves the request
 * comes from our own egress and not from someone who guessed a session id.
 */
export function recordKey(sessionId: string) {
  return createHmac("sha256", env("LIVEKIT_API_SECRET")).update(`record:${sessionId}`).digest("hex");
}

export function verifyRecordKey(sessionId: string, key: string | null | undefined) {
  if (!key) return false;
  const expected = Buffer.from(recordKey(sessionId));
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Where the egress browser loads the stage from. The app's public origin, unless a tunnel is set for local runs. */
export function recordPageUrl(sessionId: string) {
  const base = (process.env.RECORDING_PAGE_BASE_URL || publicEnv.appUrl).replace(/\/$/, "");
  return `${base}/record/${sessionId}?key=${recordKey(sessionId)}`;
}

/**
 * One web egress per session carrying both outputs: the MP4 recording and the HLS segments.
 * It films the attendee stage (deck page, presenter video where the layout puts it, activity
 * overlay) rather than compositing the room's camera tracks, so the recording shows what the
 * audience saw; a room composite only had the cameras. Participants watch over WebRTC, so the
 * HLS leg is a fallback (room full, WebRTC blocked) and the live playlist for anyone the room
 * cannot take. A single egress costs one transcode minute per minute; running the recording and
 * the HLS as two egresses doubled that and burned through the free plan's allowance in half an
 * hour. The egress waits for the page's START_RECORDING signal (the stage is on screen) so the
 * file does not open on a spinner.
 */
export async function startSessionEgress(sessionId: string) {
  const prefix = `sessions/${sessionId}/live`;
  const filepath = `sessions/${sessionId}/recording.mp4`;
  const segments = new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix: `${prefix}/seg`,
    playlistName: `${prefix}/index.m3u8`,
    livePlaylistName: `${prefix}/live.m3u8`,
    segmentDuration: 2,
    output: { case: "s3", value: s3Output() },
  });
  const file = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: { case: "s3", value: s3Output() },
  });
  const info = await egress().startWebEgress(recordPageUrl(sessionId), { file, segments }, {
    encodingOptions: EncodingOptionsPreset.H264_720P_30,
    awaitStartSignal: true,
  });
  const base = env("RECORDING_PUBLIC_BASE_URL").replace(/\/$/, "");
  return { egressId: info.egressId, hlsUrl: `${base}/${prefix}/live.m3u8`, recordingUrl: `${base}/${filepath}` };
}

function s3Client() {
  const endpoint = process.env.RECORDING_S3_ENDPOINT;
  return new S3Client({
    region: process.env.RECORDING_S3_REGION || "auto",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: { accessKeyId: env("RECORDING_S3_ACCESS_KEY"), secretAccessKey: env("RECORDING_S3_SECRET_KEY") },
  });
}

/**
 * Remove everything the egress wrote for a session: the MP4 and the HLS playlist and segments
 * under sessions/<id>/. Returns the number of objects removed; zero when nothing was there,
 * which is not an error (a failed egress leaves nothing behind).
 */
export async function deleteSessionRecording(sessionId: string, { dryRun = false } = {}) {
  const s3 = s3Client();
  const Bucket = env("RECORDING_S3_BUCKET");
  const Prefix = `sessions/${sessionId}/`;
  let token: string | undefined;
  let removed = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length && !dryRun) {
      const out = await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
      if (out.Errors?.length) throw new Error(`could not delete ${out.Errors.length} object(s) for ${sessionId}: ${out.Errors[0].Message}`);
    }
    removed += keys.length;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

export async function stopEgress(egressId: string) {
  try {
    await egress().stopEgress(egressId);
  } catch (err) {
    console.warn("stopEgress failed", egressId, err);
  }
}
