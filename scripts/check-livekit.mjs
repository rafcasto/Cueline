#!/usr/bin/env node
// Ask LiveKit what it sees: the project is reachable, which rooms are open and who is publishing
// in them, and every egress with its status and error. Then fetch the HLS playlist each egress
// wrote and report the status code, the CORS header and the content type. Usage: pnpm video:check
// Reads LIVEKIT_* and RECORDING_* from .env.local or the environment; writes nothing anywhere.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(process.cwd(), "apps/web/package.json"));
const { EgressClient, RoomServiceClient } = require("livekit-server-sdk");

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const STATUS = ["STARTING", "ACTIVE", "ENDING", "COMPLETE", "FAILED", "ABORTED", "LIMIT_REACHED"];
// Flush stdout before exiting, or the warnings above the failure vanish when piped.
const fail = (msg) => {
  process.stdout.write(`\n✗ ${msg}\n`, () => process.exit(1));
  return new Promise(() => undefined);
};
const ok = (msg) => console.log(`✓ ${msg}`);
const warn = (msg) => console.log(`! ${msg}`);

// 1. Configuration present and plausible.
const url = process.env.LIVEKIT_URL ?? "";
const key = process.env.LIVEKIT_API_KEY ?? "";
const secret = process.env.LIVEKIT_API_SECRET ?? "";
if (!url || !key || !secret) await fail("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set (see .env.example).");
if (!/^wss:\/\/[a-z0-9-]+\.livekit\.cloud$/.test(url)) warn(`LIVEKIT_URL is "${url}". LiveKit Cloud projects look like wss://<name>-<id>.livekit.cloud; copy it from the project's Settings page.`);
if (url === "wss://cueline.livekit.cloud") warn("That is the placeholder from .env.example, not a real project URL.");
for (const k of ["RECORDING_S3_BUCKET", "RECORDING_S3_ACCESS_KEY", "RECORDING_S3_SECRET_KEY", "RECORDING_PUBLIC_BASE_URL"]) {
  if (!process.env[k]) warn(`${k} is not set; egress will fail to upload.`);
}
const endpoint = process.env.RECORDING_S3_ENDPOINT ?? "";
if (!endpoint) warn("RECORDING_S3_ENDPOINT is not set. For R2 it must be https://<account-id>.r2.cloudflarestorage.com, or the upload goes to AWS.");
else if (endpoint.includes("r2.cloudflarestorage.com")) {
  if ((process.env.RECORDING_S3_REGION ?? "auto") !== "auto") warn("RECORDING_S3_REGION should be auto for R2.");
  if (endpoint.replace(/https?:\/\//, "").split("/").length > 1) warn("RECORDING_S3_ENDPOINT should not include the bucket name; the bucket goes in RECORDING_S3_BUCKET.");
  if ((process.env.RECORDING_PUBLIC_BASE_URL ?? "").includes("r2.cloudflarestorage.com")) warn("RECORDING_PUBLIC_BASE_URL points at the private S3 endpoint; it must be the public r2.dev URL or a custom domain.");
}

const http = url.replace(/^wss?:\/\//, "https://");
const rooms = new RoomServiceClient(http, key, secret);
const egress = new EgressClient(http, key, secret);

// 2. Reachable, credentials accepted.
let open;
try {
  open = await rooms.listRooms();
  ok(`LiveKit reachable at ${http}; ${open.length} open room(s).`);
} catch (err) {
  await fail(`LiveKit rejected the request: ${err.message}. Check LIVEKIT_URL and that the key and secret belong to that project.`);
}

// 3. Who is in each room, and what are they publishing.
for (const r of open) {
  const ps = await rooms.listParticipants(r.name);
  console.log(`\nroom ${r.name}: ${ps.length} participant(s)`);
  let publishing = 0;
  for (const p of ps) {
    const kinds = p.tracks.map((t) => (t.type === 1 ? "video" : t.type === 0 ? "audio" : "data") + (t.muted ? "(muted)" : ""));
    if (p.tracks.some((t) => !t.muted)) publishing++;
    console.log(`  ${p.identity}${p.name ? ` (${p.name})` : ""}: ${kinds.join(", ") || "publishing nothing"}`);
  }
  if (ps.length === 0) warn("Nobody is in this room. Room-composite egress films an empty room: black video, no audio. The host must click \"Join with camera\".");
  else if (publishing === 0) warn("Nobody is publishing a track. The composite will be black and silent until a camera or microphone is on.");
}

// 4. Egresses and their errors.
const list = await egress.listEgress({});
console.log(`\n${list.length} egress(es) known to the project:`);
const playlists = new Set();
for (const e of list.sort((a, b) => Number(b.startedAt - a.startedAt)).slice(0, 10)) {
  const kind = e.request.case === "roomComposite" ? "room composite" : e.request.case;
  const line = `  ${e.egressId} room=${e.roomName} ${kind} ${STATUS[e.status] ?? e.status}`;
  console.log(e.error ? `${line}\n    error: ${e.error}` : line);
  // Results live in the `result` oneof; the plural arrays stay empty for single-output requests.
  const segs = e.result.case === "segments" ? [e.result.value] : e.segmentResults;
  const files = e.result.case === "file" ? [e.result.value] : e.fileResults;
  for (const s of segs) {
    console.log(`    segments: ${s.segmentCount} written (${Math.round(Number(s.size) / 1e6)} MB, ${Math.round(Number(s.duration) / 1e9)} s), live playlist ${s.livePlaylistLocation || "(none yet)"}`);
    if (s.livePlaylistLocation) playlists.add(s.livePlaylistLocation);
  }
  for (const f of files) console.log(`    file: ${f.location || f.filename} ${f.size ? `${Math.round(Number(f.size) / 1e6)} MB` : ""}`);
}
if (list.some((e) => e.status === 4)) {
  warn("A FAILED egress with an upload or S3 error means LiveKit could not write to the bucket: check the endpoint, bucket name and the R2 token's permissions.");
}

// 5. Can a browser fetch what egress wrote?
const base = (process.env.RECORDING_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
for (const location of playlists) {
  // Egress reports the S3 key path; viewers read it from the public base URL.
  // Egress reports the S3 location, endpoint and bucket included; viewers read the key from the public base URL.
  const bucket = process.env.RECORDING_S3_BUCKET ?? "";
  let path = location.replace(/^s3:\/\/[^/]+\//, "").replace(/^https?:\/\/[^/]+\//, "");
  if (bucket && path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  else path = path.replace(/^[^/]+\/(?=sessions\/)/, "");
  const target = `${base}/${path}`;
  console.log(`\nfetching ${target}`);
  try {
    const res = await fetch(target, { method: "GET", headers: { Origin: process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com" } });
    const cors = res.headers.get("access-control-allow-origin");
    const type = res.headers.get("content-type") ?? "";
    console.log(`  HTTP ${res.status}; access-control-allow-origin: ${cors ?? "(missing)"}; content-type: ${type || "(missing)"}`);
    if (res.status === 404) warn("Not found at the public URL. Either egress has not written yet or RECORDING_PUBLIC_BASE_URL does not serve this bucket.");
    if (res.status >= 500) warn(`HTTP ${res.status} from the public URL: the domain in RECORDING_PUBLIC_BASE_URL is not connected to the bucket (R2: bucket Settings, Custom Domains) or is behind a proxy.`);
    if (res.ok && !cors) warn("No CORS header: browsers other than Safari will refuse to load this. Add the CORS policy on the bucket.");
    if (res.ok && !/mpegurl/i.test(type)) warn("Content type is not application/vnd.apple.mpegurl; Safari will not play it, Chrome and Firefox will.");
    if (res.ok) {
      const body = await res.text();
      const segs = body.split("\n").filter((l) => l && !l.startsWith("#"));
      ok(`playlist has ${segs.length} segment(s); last: ${segs.at(-1) ?? "(none)"}`);
    }
  } catch (err) {
    warn(`fetch failed: ${err.cause?.code ?? err.message}. If this is ENOTFOUND, the domain in RECORDING_PUBLIC_BASE_URL has no DNS record: connect it to the bucket in R2 (Settings, Custom Domains) or use the bucket's r2.dev URL.`);
  }
}
if (playlists.size === 0) console.log("\nNo HLS egress has written a playlist yet. Go live in a session and run this again.");
