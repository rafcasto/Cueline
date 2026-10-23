import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUME, MEDIA_LIMIT_BYTES, checkMediaFile, fileLabel, formatBytes, normalizeWaitingRoom, soundSource } from "./waiting-room";

describe("normalizeWaitingRoom", () => {
  it("fills defaults for the migration's initial row", () => {
    expect(normalizeWaitingRoom({ background: { type: "image" }, elements: [] })).toEqual({ background: { type: "image", volume: DEFAULT_VOLUME }, elements: [] });
  });

  it("folds the old image_audio shape into image plus a track", () => {
    const out = normalizeWaitingRoom({ background: { type: "image_audio", image_url: "i.png", audio_url: "m.mp3" }, elements: [] });
    expect(out.background).toEqual({ type: "image", image_url: "i.png", audio_url: "m.mp3", volume: DEFAULT_VOLUME });
  });

  it("clamps volume and drops video_sound when the backdrop is a picture", () => {
    expect(normalizeWaitingRoom({ background: { type: "image", volume: 7, video_sound: true } }).background).toEqual({ type: "image", volume: 1 });
    expect(normalizeWaitingRoom({ background: { type: "video", volume: -1, video_url: "v.mp4", video_sound: true } }).background).toEqual({ type: "video", video_url: "v.mp4", video_sound: true, volume: 0 });
  });

  it("tolerates a missing or malformed config", () => {
    expect(normalizeWaitingRoom(null).elements).toEqual([]);
    expect(normalizeWaitingRoom({ elements: "nope" as unknown as [] }).elements).toEqual([]);
  });
});

describe("soundSource", () => {
  it("prefers the video's own sound when the host switched it on", () => {
    expect(soundSource({ type: "video", video_url: "v.mp4", video_sound: true, audio_url: "m.mp3" })).toBe("video");
  });
  it("plays the track over a picture or a silent video", () => {
    expect(soundSource({ type: "image", image_url: "i.png", audio_url: "m.mp3" })).toBe("track");
    expect(soundSource({ type: "video", video_url: "v.mp4", audio_url: "m.mp3" })).toBe("track");
  });
  it("is silent without a track, and when video_sound has no video behind it", () => {
    expect(soundSource({ type: "image", image_url: "i.png" })).toBeNull();
    expect(soundSource({ type: "video", video_sound: true })).toBeNull();
  });
});

describe("checkMediaFile", () => {
  it("rejects files over the bucket limit with the sizes spelled out", () => {
    const r = checkMediaFile("video", { name: "intro.mp4", type: "video/mp4", size: MEDIA_LIMIT_BYTES + 1 });
    expect(r).toEqual({ error: expect.stringContaining("the limit is 100 MB") });
  });
  it("accepts the bucket's types and maps browser aliases onto them", () => {
    expect(checkMediaFile("audio", { name: "loop.m4a", type: "audio/x-m4a", size: 10 })).toEqual({ contentType: "audio/mp4" });
    expect(checkMediaFile("audio", { name: "loop.mp3", type: "audio/mp3", size: 10 })).toEqual({ contentType: "audio/mpeg" });
    expect(checkMediaFile("image", { name: "bg.JPG", type: "image/jpeg", size: 10 })).toEqual({ contentType: "image/jpeg" });
  });
  it("falls back to the extension when the browser reports no usable type", () => {
    expect(checkMediaFile("audio", { name: "loop.m4a", type: "", size: 10 })).toEqual({ contentType: "audio/mp4" });
    expect(checkMediaFile("audio", { name: "loop.wav", type: "application/octet-stream", size: 10 })).toEqual({ contentType: "audio/wav" });
  });
  it("rejects the wrong kind of file for the slot", () => {
    expect(checkMediaFile("video", { name: "bg.png", type: "image/png", size: 10 })).toEqual({ error: "bg.png is not an MP4 or WebM video." });
    expect(checkMediaFile("audio", { name: "clip.mov", type: "video/quicktime", size: 10 })).toEqual({ error: expect.stringContaining("MP3, M4A, OGG or WAV") });
  });
});

describe("formatBytes / fileLabel", () => {
  it("formats sizes the way a host reads them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(300 * 1024)).toBe("300 KB");
    expect(formatBytes(3.25 * 1024 * 1024)).toBe("3.3 MB");
    expect(formatBytes(MEDIA_LIMIT_BYTES)).toBe("100 MB");
  });
  it("shows the uploaded name without the random prefix", () => {
    expect(fileLabel("https://x.supabase.co/storage/v1/object/public/media/org/2f1c5f0e-9b1d-4c7a-8e2b-0a1b2c3d4e5f-Lo-fi%20loop.mp3")).toBe("Lo-fi loop.mp3");
    expect(fileLabel("https://x/media/org/plain.png?download=1")).toBe("plain.png");
  });
});
