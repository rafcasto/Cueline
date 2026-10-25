"use client";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { clampVideoBox, nudgeVideoBox, stageBoxes, toCustom, type Box } from "@/lib/stage-layout";
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
 * The 16:9 stage every attendee sees: the deck page and the presenter video placed by the
 * session's layout. The host's live panel renders the same component around their own
 * camera, so what they see is exactly what attendees get; with `editable` the camera can
 * be dragged into a custom position (from any preset: the drag switches the layout to
 * custom where it was) and resized from its bottom-right corner, with arrow keys and
 * plus/minus for the keyboard. Regions animate between arrangements so a change reads as
 * a move, not a cut; the animation is off while dragging and under reduced motion.
 */
export function StageCanvas({ layout, slide, video, editable, onChange, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // The box under the pointer during a gesture; the saved layout is only written when it ends.
  const [draft, setDraft] = useState<StageLayout | null>(null);
  const shown = draft ?? layout;
  const { slide: slideBox, video: videoBox, fit } = stageBoxes(shown);
  const dragging = draft !== null;

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
    gesture.current = { kind, start: clampVideoBox(start.video), px: p.x, py: p.y };
    setDraft(start);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = percent(e);
    const dx = p.x - g.px;
    const dy = p.y - g.py;
    if (g.kind === "move") setDraft({ mode: "custom", video: clampVideoBox({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }) });
    // Resize from the corner: the width follows the larger of the two deltas so the box grows with the hand.
    else setDraft({ mode: "custom", video: clampVideoBox({ ...g.start, w: g.start.w + Math.max(dx, dy) }) });
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

  const animate = dragging ? "" : "transition-[left,top,width,height] duration-300 ease-out motion-reduce:transition-none";

  return (
    <div ref={ref} className={cx("relative aspect-video overflow-hidden bg-black", editable && dragging && "cursor-grabbing select-none", className)}>
      {slideBox && (
        <div className={cx("absolute flex items-center justify-center", animate)} style={regionStyle(slideBox)}>
          <div className="w-full">{slide}</div>
        </div>
      )}
      <div
        className={cx(
          "absolute overflow-hidden bg-black",
          animate,
          videoBox.w < 100 && "rounded-lg shadow-overlay ring-1 ring-white/20",
          editable && "cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
          editable && shown.mode === "custom" && "ring-2 ring-white/70",
        )}
        style={regionStyle(videoBox)}
        data-fit={fit}
        tabIndex={editable ? 0 : undefined}
        role={editable ? "group" : undefined}
        aria-label={editable ? "Camera position. Drag to move; arrow keys move it, plus and minus resize it." : undefined}
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKey}
      >
        <div className="h-full w-full">{video}</div>
        {editable && (
          <>
            {/* A see-through sheet over the video so a drag starts on the box and not on the player's own buttons. */}
            <div className="absolute inset-0" aria-hidden />
            {shown.mode === "custom" && (
              <button
                type="button"
                aria-label="Resize the camera"
                onPointerDown={(e) => begin(e, "resize")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                className="absolute bottom-0 right-0 size-5 cursor-nwse-resize touch-none rounded-tl-md bg-white/90 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <span className="sr-only">Resize</span>
                <svg viewBox="0 0 20 20" className="size-5 text-slate-700" aria-hidden>
                  <path d="M17 7v10H7M17 12v5h-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
      {children}
    </div>
  );
}
