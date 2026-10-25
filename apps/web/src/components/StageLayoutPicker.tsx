"use client";
import { cx } from "@/components/ui";
import { LAYOUT_MODES, stageBoxes } from "@/lib/stage-layout";
import type { StageLayout, StageLayoutMode } from "@/lib/supabase/types";

type Props = {
  value: StageLayout;
  onChange: (layout: StageLayout) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * The four arrangements as a radio group of small diagrams. Each diagram is drawn from the
 * same geometry the stage uses (`stageBoxes`), so the picture is the layout, not an icon
 * that approximates it. Picking Custom starts from the corner box; the host then drags
 * the camera on the stage above.
 */
export function StageLayoutPicker({ value, onChange, disabled, className }: Props) {
  const pick = (mode: StageLayoutMode) => {
    if (mode === value.mode) return;
    onChange(mode === "custom" ? { mode, video: value.mode === "custom" ? value.video : undefined } : { mode });
  };
  return (
    <div role="radiogroup" aria-label="Video placement" className={cx("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
      {LAYOUT_MODES.map((m) => {
        const selected = value.mode === m.mode;
        return (
          <button
            key={m.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => pick(m.mode)}
            title={m.description}
            className={cx(
              "group flex flex-col items-start gap-2 rounded-lg border p-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
              selected ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line bg-surface-raised hover:border-line-strong hover:bg-surface-inset",
            )}
          >
            <LayoutDiagram mode={m.mode} selected={selected} />
            <span className={cx("text-xs font-medium", selected ? "text-brand-ink" : "text-ink-muted group-hover:text-ink")}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A 16:9 miniature of one arrangement: the deck region in grey, the camera in the accent. */
function LayoutDiagram({ mode, selected }: { mode: StageLayoutMode; selected: boolean }) {
  const { slide, video } = stageBoxes(mode === "custom" ? { mode, video: { x: 8, y: 40, w: 36 } } : { mode });
  return (
    <svg viewBox="0 0 160 90" className="w-full rounded-md bg-surface-inset" aria-hidden>
      {slide && <rect x={slide.x * 1.6 + 3} y={slide.y * 0.9 + 3} width={slide.w * 1.6 - 6} height={slide.h * 0.9 - 6} rx="4" className="fill-line-strong" />}
      {slide && (
        <g className="stroke-surface-raised" strokeWidth="3" strokeLinecap="round">
          <line x1={slide.x * 1.6 + 16} y1={slide.y * 0.9 + 20} x2={slide.x * 1.6 + slide.w * 0.8} y2={slide.y * 0.9 + 20} />
          <line x1={slide.x * 1.6 + 16} y1={slide.y * 0.9 + 32} x2={slide.x * 1.6 + slide.w * 1.1} y2={slide.y * 0.9 + 32} />
        </g>
      )}
      <rect x={video.x * 1.6 + 3} y={video.y * 0.9 + 3} width={video.w * 1.6 - 6} height={video.h * 0.9 - 6} rx="4" className={selected ? "fill-brand" : "fill-ink-faint"} />
      {mode === "custom" && (
        <rect x={video.x * 1.6 + 3} y={video.y * 0.9 + 3} width={video.w * 1.6 - 6} height={video.h * 0.9 - 6} rx="4" className="fill-none stroke-surface-raised" strokeWidth="2" strokeDasharray="4 3" />
      )}
    </svg>
  );
}
