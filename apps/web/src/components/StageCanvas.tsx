"use client";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { clampVideoBox, layoutShape, nudgeVideoBox, stageBoxes, toCustom, type Box } from "@/lib/stage-layout";
import type { StageLayout } from "@/lib/supabase/types";

type Props = {
  layout: StageLayout;
  /** The deck page; rendered at the width of its region and centred in it. */
  slide: ReactNode;
  /** The presenter video, filling its region. */
  video: ReactNode;
  /** The host's editor: drag the camera, resize it from the corner, nudge it with the keys. */
  editable?: boolean;
  /** Fired once per gesture (pointer up, key press), not on every pointer move. */
  onChange?: (layout: StageLayout) => void;
  /** Anything that sits over the whole stage: the activity overlay. */
  children?: ReactNode;
  className?: string;
};

type Gesture = { kind: "move" | "resize"; start: { x: number; y: number; w: number }; px: number; py: number };

function regionStyle(b: Box): CSSProperties {
  return { left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` };
}

/**
 * Where the resize handle sits. On a rectangle, in its bottom-right corner. On a circle, on
 * the rim at the same diagonal: the corner of the circle's square is outside the circle, so a
 * handle there would float in the slide. The rim crosses the diagonal (1 − 1/√2) / 2 of the
 * side in from each edge, and the handle is centred on that point.
 */
const RIM_INSET = `${(((1 - 1 / Math.SQRT2) / 2) * 100).toFixed(2)}%`;
const HANDLE_HALF = "0.625rem";
const circleHandleStyle: CSSProperties = { right: `calc(${RIM_INSET} - ${HANDLE_HALF})`, bottom: `calc(${RIM_INSET} - ${HANDLE_HALF})` };

/**
 * The 16:9 stage every attendee sees: the deck page and the presenter video placed by the
 * session's layout. The host's live panel renders the same component around their own
 * camera, so what they see is exactly what attendees get; with `editable` the camera can
 * be dragged into a custom position (from any preset: the drag switches the layout to
 * custom where it was) and resized from its bottom-right corner, with arrow keys and
 * plus/minus for the keyboard. The camera is a rounded rectangle or, when the layout says
 * so, a circle (clipped by the frame inside the region, so the handle can sit on its rim).
 * Regions animate between arrangements so a change reads as a move, not a cut; the
 * animation is off while dragging and under reduced motion.
 */
export function StageCanvas({ layout, slide, video, editable, onChange, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // The box under the pointer during a gesture; the saved layout is only written when it ends.
  const [draft, setDraft] = useState<StageLayout | null>(null);
  const shown = draft ?? layout;
  const { slide: slideBox, video: videoBox, fit, shape } = stageBoxes(shown);
  const dragging = draft !== null;
  const circle = shape === "circle";

  const percent = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const begin = (e: PointerEvent, kind: Gesture["kind"]) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = toCustom(layout);
    const p = percent(e);
    gesture.current = { kind, start: clampVideoBox(start.video, layoutShape(start)), px: p.x, py: p.y };
    setDraft(start);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = percent(e);
    const dx = p.x - g.px;
    const dy = p.y - g.py;
    const s = layoutShape(shown);
    if (g.kind === "move") setDraft({ ...shown, mode: "custom", video: clampVideoBox({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, s) });
    else {
      // Resize from the corner: the width follows the larger of the two deltas so the box grows with the hand.
      // A 16:9 box moves as far in width percent as in height percent; a circle's height percent is 16/9 of its width's.
      const dyAsWidth = s === "circle" ? dy * (9 / 16) : dy;
      setDraft({ ...shown, mode: "custom", video: clampVideoBox({ ...g.start, w: g.start.w + Math.max(dx, dyAsWidth) }, s) });
    }
  };
  const end = () => {
    if (!gesture.current) return;
    gesture.current = null;
    if (draft) onChange?.(draft);
    setDraft(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!editable || shown.mode !== "custom") return;
    const next = nudgeVideoBox(shown, e.key, e.shiftKey ? 5 : 1);
    if (next === shown) return;
    e.preventDefault();
    onChange?.(next);
  };

  const animate = dragging ? "" : "transition-[left,top,width,height,border-radius] duration-300 ease-out motion-reduce:transition-none";
  const thumbnail = videoBox.w < 100;

  return (
    <div ref={ref} className={cx("relative aspect-video overflow-hidden bg-black", editable && dragging && "cursor-grabbing select-none", className)}>
      {slideBox && (
        <div className={cx("absolute flex items-center justify-center", animate)} style={regionStyle(slideBox)}>
          <div className="w-full">{slide}</div>
        </div>
      )}
      <div
        className={cx(
          "absolute",
          animate,
          circle ? "rounded-full" : thumbnail && "rounded-lg",
          editable && "cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        )}
        style={regionStyle(videoBox)}
        data-fit={fit}
        data-shape={shape}
        tabIndex={editable ? 0 : undefined}
        role={editable ? "group" : undefined}
        aria-label={editable ? "Camera position. Drag to move; arrow keys move it, plus and minus resize it." : undefined}
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKey}
      >
        {/* The frame clips the video to its shape; the handle sits outside the frame so a circle does not cut it off. */}
        <div
          className={cx(
            "absolute inset-0 overflow-hidden bg-black",
            animate,
            circle ? "rounded-full" : thumbnail && "rounded-lg",
            thumbnail && "shadow-overlay ring-1 ring-white/20",
            editable && shown.mode === "custom" && "ring-2 ring-white/70",
          )}
        >
          <div className="h-full w-full">{video}</div>
          {/* A see-through sheet over the video so a drag starts on the box and not on the player's own buttons. */}
          {editable && <div className="absolute inset-0" aria-hidden />}
        </div>
        {editable && shown.mode === "custom" && (
          <button
            type="button"
            aria-label="Resize the camera"
            onPointerDown={(e) => begin(e, "resize")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            style={circle ? circleHandleStyle : undefined}
            className={cx(
              "absolute size-5 cursor-nwse-resize touch-none bg-white/90 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
              circle ? "rounded-full" : "bottom-0 right-0 rounded-tl-md",
            )}
          >
            <span className="sr-only">Resize</span>
            <svg viewBox="0 0 20 20" className="size-5 text-slate-700" aria-hidden>
              <path d="M17 7v10H7M17 12v5h-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
