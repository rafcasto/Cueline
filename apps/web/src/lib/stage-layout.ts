/**
 * Stage layout: where the presenter video sits against the deck page. Four arrangements,
 * stored as one `jsonb` on the session (`sessions.layout`, so a change reaches attendees
 * through the session broadcast) and remembered on the room (`rooms.stage_layout`) as the
 * starting point of the next session. Pure functions shared by the host's editor, the
 * attendee room and the little diagrams in the picker, so every one of them draws the
 * same rectangle; unit-tested without a browser.
 *
 * Geometry is in percent of a 16:9 stage. A 16:9 box inside a 16:9 stage has the same
 * percentage width and height, which is why a custom position stores only `w`.
 */
import type { StageLayout, StageLayoutMode, StageVideoBox } from "@/lib/supabase/types";

export type Box = { x: number; y: number; w: number; h: number };

export const DEFAULT_LAYOUT: StageLayout = { mode: "default" };

/** The corner thumbnail: a quarter of the stage width, two percent in from the bottom-right. */
export const CORNER_BOX: StageVideoBox = { x: 74, y: 74, w: 24 };

export const VIDEO_MIN_W = 10;
export const VIDEO_MAX_W = 100;

export const LAYOUT_MODES: { mode: StageLayoutMode; label: string; description: string }[] = [
  { mode: "default", label: "Corner", description: "The deck page, with your camera in the bottom-right corner." },
  { mode: "talking_head", label: "Talking head", description: "Your camera fills the stage; the deck is hidden." },
  { mode: "split", label: "Side by side", description: "The deck page on the left, your camera on the right, half each." },
  { mode: "custom", label: "Custom", description: "Drag your camera anywhere on the stage and resize it from the corner." },
];

const MODES = new Set<string>(LAYOUT_MODES.map((m) => m.mode));

function round(n: number) {
  return Math.round(n * 2) / 2;
}

/** Keep a custom box inside the stage: width within limits, then position so it never spills over an edge. */
export function clampVideoBox(box: Partial<StageVideoBox> | null | undefined): StageVideoBox {
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const w = round(Math.min(VIDEO_MAX_W, Math.max(VIDEO_MIN_W, num(box?.w, CORNER_BOX.w))));
  const x = round(Math.min(100 - w, Math.max(0, num(box?.x, CORNER_BOX.x))));
  const y = round(Math.min(100 - w, Math.max(0, num(box?.y, CORNER_BOX.y))));
  return { x, y, w };
}

/** One shape for every row: an unknown mode falls back to the corner, a custom layout always carries a valid box. */
export function normalizeStageLayout(raw: unknown): StageLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<StageLayout>;
  const mode: StageLayoutMode = typeof r.mode === "string" && MODES.has(r.mode) ? (r.mode as StageLayoutMode) : "default";
  if (mode === "custom") return { mode, video: clampVideoBox(r.video) };
  return { mode };
}

/** Strict parse for a save: the mode must be one of ours and a custom box must have finite numbers. */
export function parseStageLayout(raw: unknown): { layout: StageLayout } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : null) as Partial<StageLayout> | null;
  if (!r) return { error: "The stage layout must be an object." };
  if (typeof r.mode !== "string" || !MODES.has(r.mode)) return { error: `The stage layout must be one of ${LAYOUT_MODES.map((m) => m.mode).join(", ")}.` };
  if (r.mode === "custom") {
    const v = r.video;
    if (!v || typeof v !== "object" || [v.x, v.y, v.w].some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      return { error: "A custom layout needs the camera position as x, y and w in percent." };
    }
    return { layout: { mode: "custom", video: clampVideoBox(v) } };
  }
  return { layout: { mode: r.mode } };
}

/**
 * Where the two regions go. `slide` is null when the deck is hidden. The video is a
 * 16:9 box except side by side, where it is a tall half and the camera is cropped to
 * fill it (`fit: "cover"`), as a presenter standing beside the deck would be framed.
 */
export function stageBoxes(layout: StageLayout): { slide: Box | null; video: Box; fit: "cover" | "contain" } {
  switch (layout.mode) {
    case "talking_head":
      return { slide: null, video: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover" };
    case "split":
      return { slide: { x: 0, y: 0, w: 50, h: 100 }, video: { x: 50, y: 0, w: 50, h: 100 }, fit: "cover" };
    case "custom": {
      const v = clampVideoBox(layout.video);
      return { slide: { x: 0, y: 0, w: 100, h: 100 }, video: { x: v.x, y: v.y, w: v.w, h: v.w }, fit: "cover" };
    }
    default:
      return { slide: { x: 0, y: 0, w: 100, h: 100 }, video: { ...CORNER_BOX, h: CORNER_BOX.w }, fit: "cover" };
  }
}

/** The box a drag starts from when the host pulls the corner thumbnail into a custom position. */
export function toCustom(layout: StageLayout): StageLayout {
  if (layout.mode === "custom") return layout;
  const { video } = stageBoxes(layout);
  // A half or a full stage is not 16:9; start from a box the same width capped so it fits.
  return { mode: "custom", video: clampVideoBox({ x: video.x, y: video.y, w: Math.min(video.w, video.h) }) };
}

/** Nudge a custom box with the keyboard: arrows move, plus and minus resize. Returns the same layout for other keys. */
export function nudgeVideoBox(layout: StageLayout, key: string, step = 1): StageLayout {
  if (layout.mode !== "custom") return layout;
  const v = clampVideoBox(layout.video);
  switch (key) {
    case "ArrowLeft":
      return { mode: "custom", video: clampVideoBox({ ...v, x: v.x - step }) };
    case "ArrowRight":
      return { mode: "custom", video: clampVideoBox({ ...v, x: v.x + step }) };
    case "ArrowUp":
      return { mode: "custom", video: clampVideoBox({ ...v, y: v.y - step }) };
    case "ArrowDown":
      return { mode: "custom", video: clampVideoBox({ ...v, y: v.y + step }) };
    case "+":
    case "=":
      return { mode: "custom", video: clampVideoBox({ ...v, w: v.w + step }) };
    case "-":
    case "_":
      return { mode: "custom", video: clampVideoBox({ ...v, w: v.w - step }) };
    default:
      return layout;
  }
}

/** A sentence for the status line under the stage, for the host and for assistive tech. */
export function describeLayout(layout: StageLayout): string {
  if (layout.mode === "custom") {
    const v = clampVideoBox(layout.video);
    return `Your camera is ${v.w}% of the stage wide, ${v.x}% from the left and ${v.y}% from the top.`;
  }
  return LAYOUT_MODES.find((m) => m.mode === layout.mode)?.description ?? "";
}

export function sameLayout(a: StageLayout, b: StageLayout): boolean {
  const na = normalizeStageLayout(a);
  const nb = normalizeStageLayout(b);
  if (na.mode !== nb.mode) return false;
  if (na.mode !== "custom") return true;
  return na.video!.x === nb.video!.x && na.video!.y === nb.video!.y && na.video!.w === nb.video!.w;
}
