/**
 * Waiting-room helpers shared by the attendee view and the host editor: the
 * normalised config shape, which sound plays, and what the media bucket accepts.
 * Pure functions, so they are unit-tested without a browser.
 */
import type { WaitingRoom, WaitingRoomBackground } from "@/lib/supabase/types";

export const DEFAULT_VOLUME = 0.6;

/** Mirrors the `media` bucket in the init migration: 100 MB and these content types. */
export const MEDIA_LIMIT_BYTES = 100 * 1024 * 1024;
export const MEDIA_ACCEPT = {
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav"],
} as const;
export type MediaKind = keyof typeof MEDIA_ACCEPT;

/** `accept` for the file pickers; extensions cover browsers that report no type for M4A. */
export const MEDIA_PICKER_ACCEPT: Record<MediaKind, string> = {
  image: "image/png,image/jpeg,image/webp,image/gif",
  video: "video/mp4,video/webm",
  audio: "audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav",
};

const FORMATS: Record<MediaKind, string> = {
  image: "a PNG, JPEG, WebP or GIF picture",
  video: "an MP4 or WebM video",
  audio: "an MP3, M4A, OGG or WAV track",
};

/** What browsers report for the same files, mapped onto what the bucket allows. */
const ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "image/jpg": "image/jpeg",
};
const BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
};

/**
 * Check a file against the bucket before uploading, so the host reads "this is 140 MB;
 * the limit is 100 MB" instead of a storage error. Returns the content type to upload with.
 */
export function checkMediaFile(kind: MediaKind, file: { name: string; type: string; size: number }): { contentType: string } | { error: string } {
  if (file.size > MEDIA_LIMIT_BYTES) {
    return { error: `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MEDIA_LIMIT_BYTES)}. Compress or trim it and try again.` };
  }
  const reported = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const allowed: readonly string[] = MEDIA_ACCEPT[kind];
  const contentType = [ALIASES[reported], reported, BY_EXT[ext]].find((t) => t && allowed.includes(t));
  if (!contentType) return { error: `${file.name} is not ${FORMATS[kind]}.` };
  return { contentType };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** The name the host uploaded, without the random prefix `uploadToBucket` adds. */
export function fileLabel(url: string) {
  const last = url.split("?")[0].split("/").pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* keep the raw segment */
  }
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "") || "file";
}

/**
 * One shape for every row, old or new. The first version stored `type: "image_audio"`
 * for an image with a track; now the track is independent of the backdrop, so that folds
 * into `image` + `audio_url`. Volume is clamped and defaulted.
 */
export function normalizeWaitingRoom(raw: Partial<WaitingRoom> | null | undefined): WaitingRoom {
  const bg: Partial<WaitingRoomBackground> = raw?.background ?? {};
  const type = bg.type === "video" ? "video" : "image";
  const volume = typeof bg.volume === "number" && Number.isFinite(bg.volume) ? Math.min(1, Math.max(0, bg.volume)) : DEFAULT_VOLUME;
  const background: WaitingRoomBackground = { type, volume };
  if (bg.image_url) background.image_url = bg.image_url;
  if (bg.video_url) background.video_url = bg.video_url;
  if (bg.audio_url) background.audio_url = bg.audio_url;
  if (type === "video" && bg.video_sound) background.video_sound = true;
  return { background, elements: Array.isArray(raw?.elements) ? raw.elements : [] };
}

/** Which sound the room plays: the video's own track, the uploaded music, or nothing. */
export function soundSource(bg: WaitingRoomBackground): "video" | "track" | null {
  if (bg.type === "video" && bg.video_url && bg.video_sound) return "video";
  if (bg.audio_url) return "track";
  return null;
}
