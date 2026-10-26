/**
 * Stage layout: where the presenter video sits against the deck page. Four arrangements,
 * stored as one `jsonb` on the session (`sessions.layout`, so a change reaches attendees
 * through the session broadcast) and remembered on the room (`rooms.stage_layout`) as the
 * starting point of the next session. Pure functions shared by the host's editor, the
 * attendee room and the little diagrams in the picker, so every one of them draws the
 * same rectangle; unit-tested without a browser.
 *
 * Geometry is in percent of a 16:9 stage. A 16:9 box inside a 16:9 stage has the same
 * percentage width and height, which is why a custom position stores only `w`. The camera
 * can also be a circle (`shape: "circle"`), which is square in pixels: `w` is then its
 * diameter in percent of the stage width and its height in percent is 16/9 of that. The
 * shape applies where the camera is a thumbnail (corner and custom); a talking head and
 * side by side fill their region whatever the shape, which is kept so it comes back with
 * the corner. A missing shape is a rectangle, so rows saved before shapes existed are unchanged.
 */
import type { StageLayout, StageLayoutMode, StageVideoBox, StageVideoShape } from "@/lib/supabase/types";

export type Box = { x: number; y: number; w: number; h: number };

export const DEFAULT_LAYOUT: StageLayout = { mode: "default" };

/** Stage height in percent of a box that is `w` percent of the stage wide and square in pixels. */
const STAGE_ASPECT = 16 / 9;

/** The corner thumbnail: a quarter of the stage width, two percent in from the bottom-right. */
export const CORNER_BOX: StageVideoBox = { x: 74, y: 74, w: 24 };
/** The corner circle: a smaller diameter, since a circle as wide as the thumbnail would be nearly half the stage tall; the same two percent in. */
export const CORNER_CIRCLE_BOX: StageVideoBox = { x: 80, y: 64.5, w: 18 };

export const VIDEO_MIN_W = 10;
export const VIDEO_MAX_W = 100;
/** A circle can be no taller than the stage: 100 × 9/16 of the width, to the half percent below. */
export const VIDEO_MAX_W_CIRCLE = 56;

export const LAYOUT_MODES: { mode: StageLayoutMode; label: string; description: string }[] = [
  { mode: "default", label: "Corner", description: "The deck page, with your camera in the bottom-right corner." },
  { mode: "talking_head", label: "Talking head", description: "Your camera fills the stage; the deck is hidden." },
  { mode: "split", label: "Side by side", description: "The deck page on the left, your camera on the right, half each." },
  { mode: "custom", label: "Custom", description: "Drag your camera anywhere on the stage and resize it from the corner." },
];

export const VIDEO_SHAPES: { shape: StageVideoShape; label: string; description: string }[] = [
  { shape: "rect", label: "Rectangle", description: "Your camera as a 16:9 rectangle with rounded corners." },
  { shape: "circle", label: "Circle", description: "Your camera cropped to a circle." },
];

const MODES = new Set<string>(LAYOUT_MODES.map((m) => m.mode));
const SHAPES = new Set<string>(VIDEO_SHAPES.map((s) => s.shape));

function round(n: number) {
  return Math.round(n * 2) / 2;
}

/** The shape of a layout, a rectangle unless it says circle. */
export function layoutShape(layout: Pick<StageLayout, "shape"> | null | undefined): StageVideoShape {
  return layout?.shape === "circle" ? "circle" : "rect";
}

/** Whether the shape shows in this arrangement: only where the camera is a thumbnail, not where it fills its region. */
export function shapeApplies(mode: StageLayoutMode): boolean {
  return mode === "default" || mode === "custom";
}

/** Height in stage percent of a box `w` wide: the same for a 16:9 rectangle, 16/9 of it for a circle. */
export function boxHeight(w: number, shape: StageVideoShape): number {
  return shape === "circle" ? w * STAGE_ASPECT : w;
}

/** Keep a custom box inside the stage: width within limits, then position so it never spills over an edge. */
export function clampVideoBox(box: Partial<StageVideoBox> | null | undefined, shape: StageVideoShape = "rect"): StageVideoBox {
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const start = shape === "circle" ? CORNER_CIRCLE_BOX : CORNER_BOX;
  const maxW = shape === "circle" ? VIDEO_MAX_W_CIRCLE : VIDEO_MAX_W;
  const w = round(Math.min(maxW, Math.max(VIDEO_MIN_W, num(box?.w, start.w))));
  // The lower limit on y is floored, not rounded, so a circle's exact height never pushes it past the bottom.
  const maxY = Math.floor((100 - boxHeight(w, shape)) * 2) / 2;
  const x = round(Math.min(100 - w, Math.max(0, num(box?.x, start.x))));
  const y = round(Math.min(maxY, Math.max(0, num(box?.y, start.y))));
  return { x, y, w };
}

/** One shape for every row: an unknown mode falls back to the corner, a custom layout always carries a valid box, a rectangle carries no `shape`. */
export function normalizeStageLayout(raw: unknown): StageLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<StageLayout>;
  const mode: StageLayoutMode = typeof r.mode === "string" && MODES.has(r.mode) ? (r.mode as StageLayoutMode) : "default";
  const shape = layoutShape(r);
  const base: StageLayout = shape === "circle" ? { mode, shape } : { mode };
  if (mode === "custom") return { ...base, video: clampVideoBox(r.video, shape) };
  return base;
}

/** Strict parse for a save: the mode must be one of ours, the shape too when given, and a custom box must have finite numbers. */
export function parseStageLayout(raw: unknown): { layout: StageLayout } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : null) as Partial<StageLayout> | null;
  if (!r) return { error: "The stage layout must be an object." };
  if (typeof r.mode !== "string" || !MODES.has(r.mode)) return { error: `The stage layout must be one of ${LAYOUT_MODES.map((m) => m.mode).join(", ")}.` };
  if (r.shape !== undefined && (typeof r.shape !== "string" || !SHAPES.has(r.shape))) {
    return { error: `The camera shape must be one of ${VIDEO_SHAPES.map((s) => s.shape).join(", ")}.` };
  }
  if (r.mode === "custom") {
    const v = r.video;
    if (!v || typeof v !== "object" || [v.x, v.y, v.w].some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      return { error: "A custom layout needs the camera position as x, y and w in percent." };
    }
  }
  return { layout: normalizeStageLayout(r) };
}

/**
 * Where the two regions go. `slide` is null when the deck is hidden. The video is a
 * 16:9 box (or a circle's square) except side by side, where it is a tall half and the camera
 * is cropped to fill it (`fit: "cover"`), as a presenter standing beside the deck would be
 * framed. `shape` is the outline to draw: a circle only where it applies.
 */
export function stageBoxes(layout: StageLayout): { slide: Box | null; video: Box; fit: "cover" | "contain"; shape: StageVideoShape } {
  const shape = shapeApplies(layout.mode) ? layoutShape(layout) : "rect";
  switch (layout.mode) {
    case "talking_head":
      return { slide: null, video: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover", shape };
    case "split":
      return { slide: { x: 0, y: 0, w: 50, h: 100 }, video: { x: 50, y: 0, w: 50, h: 100 }, fit: "cover", shape };
    case "custom": {
      const v = clampVideoBox(layout.video, shape);
      return { slide: { x: 0, y: 0, w: 100, h: 100 }, video: { x: v.x, y: v.y, w: v.w, h: boxHeight(v.w, shape) }, fit: "cover", shape };
    }
    default: {
      const c = shape === "circle" ? CORNER_CIRCLE_BOX : CORNER_BOX;
      return { slide: { x: 0, y: 0, w: 100, h: 100 }, video: { ...c, h: boxHeight(c.w, shape) }, fit: "cover", shape };
    }
  }
}

/** The box a drag starts from when the host pulls the corner thumbnail into a custom position. */
export function toCustom(layout: StageLayout): StageLayout {
  if (layout.mode === "custom") return layout;
  const shape = layoutShape(layout);
  const { video } = stageBoxes(layout);
  // A half or a full stage is not 16:9; start from a box the same width capped so it fits.
  const w = Math.min(video.w, video.h);
  return { ...layout, mode: "custom", video: clampVideoBox({ x: video.x, y: video.y, w }, shape) };
}

/** The same arrangement with the other outline; a custom box is re-clamped, since a circle is taller and may not go as wide. */
export function withShape(layout: StageLayout, shape: StageVideoShape): StageLayout {
  const next: StageLayout = { ...layout };
  if (shape === "circle") next.shape = shape;
  else delete next.shape;
  if (next.mode === "custom") next.video = clampVideoBox(next.video, shape);
  return next;
}

/** Nudge a custom box with the keyboard: arrows move, plus and minus resize. Returns the same layout for other keys. */
export function nudgeVideoBox(layout: StageLayout, key: string, step = 1): StageLayout {
  if (layout.mode !== "custom") return layout;
  const shape = layoutShape(layout);
  const v = clampVideoBox(layout.video, shape);
  const moved = (video: Partial<StageVideoBox>): StageLayout => ({ ...layout, video: clampVideoBox({ ...v, ...video }, shape) });
  switch (key) {
    case "ArrowLeft":
      return moved({ x: v.x - step });
    case "ArrowRight":
      return moved({ x: v.x + step });
    case "ArrowUp":
      return moved({ y: v.y - step });
    case "ArrowDown":
      return moved({ y: v.y + step });
    case "+":
    case "=":
      return moved({ w: v.w + step });
    case "-":
    case "_":
      return moved({ w: v.w - step });
    default:
      return layout;
  }
}

/** A sentence for the status line under the stage, for the host and for assistive tech. */
export function describeLayout(layout: StageLayout): string {
  const circle = shapeApplies(layout.mode) && layoutShape(layout) === "circle";
  if (layout.mode === "custom") {
    const v = clampVideoBox(layout.video, layoutShape(layout));
    return `Your camera is ${circle ? "a circle " : ""}${v.w}% of the stage wide, ${v.x}% from the left and ${v.y}% from the top.`;
  }
  if (layout.mode === "default" && circle) return "The deck page, with your camera as a circle in the bottom-right corner.";
  return LAYOUT_MODES.find((m) => m.mode === layout.mode)?.description ?? "";
}

export function sameLayout(a: StageLayout, b: StageLayout): boolean {
  const na = normalizeStageLayout(a);
  const nb = normalizeStageLayout(b);
  if (na.mode !== nb.mode) return false;
  // The shape counts in every mode: it is kept through a talking head so it comes back with the corner.
  if (layoutShape(na) !== layoutShape(nb)) return false;
  if (na.mode !== "custom") return true;
  return na.video!.x === nb.video!.x && na.video!.y === nb.video!.y && na.video!.w === nb.video!.w;
}
