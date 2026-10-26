"use client";
import { cx } from "@/components/ui";
import { LAYOUT_MODES, VIDEO_SHAPES, layoutShape, shapeApplies, stageBoxes, withShape } from "@/lib/stage-layout";
import type { StageLayout, StageLayoutMode, StageVideoShape } from "@/lib/supabase/types";

type Props = {
  value: StageLayout;
  onChange: (layout: StageLayout) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * The four arrangements as a radio group of small diagrams, with the camera's outline
 * (rectangle or circle) as a second, smaller radio group under them. Each diagram is drawn
 * from the same geometry the stage uses (`stageBoxes`), so the picture is the layout, not an
 * icon that approximates it. Picking Custom starts from the corner box; the host then drags
 * the camera on the stage above. The shape stays with the layout through every arrangement
 * and the shape row says so where it does not show (talking head, side by side).
 */
export function StageLayoutPicker({ value, onChange, disabled, className }: Props) {
  const shape = layoutShape(value);
  const pick = (mode: StageLayoutMode) => {
    if (mode === value.mode) return;
    const next: StageLayout = mode === "custom" ? { mode, video: value.mode === "custom" ? value.video : undefined } : { mode };
    onChange(shape === "circle" ? { ...next, shape } : next);
  };
  const pickShape = (s: StageVideoShape) => {
    if (s === shape) return;
    onChange(withShape(value, s));
  };
  const shows = shapeApplies(value.mode);
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Video placement" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              <LayoutDiagram mode={m.mode} shape={shape} selected={selected} />
              <span className={cx("text-xs font-medium", selected ? "text-brand-ink" : "text-ink-muted group-hover:text-ink")}>{m.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span id="video-shape-label" className="text-xs font-medium text-ink-muted">
          Camera shape
        </span>
        <div role="radiogroup" aria-labelledby="video-shape-label" className="inline-flex rounded-md border border-line bg-surface-raised p-0.5">
          {VIDEO_SHAPES.map((s) => {
            const selected = shape === s.shape;
            return (
              <button
                key={s.shape}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => pickShape(s.shape)}
                title={s.description}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                  selected ? "bg-brand text-white shadow-card" : "text-ink-muted hover:bg-surface-inset hover:text-ink",
                )}
              >
                <ShapeGlyph shape={s.shape} />
                {s.label}
              </button>
            );
          })}
        </div>
        {!shows && <span className="text-xs text-ink-faint">Shows in the corner and custom placements; your camera fills its space here.</span>}
      </div>
    </div>
  );
}

/** A 16:9 miniature of one arrangement: the deck region in grey, the camera in the accent. */
function LayoutDiagram({ mode, shape, selected }: { mode: StageLayoutMode; shape: StageVideoShape; selected: boolean }) {
  const layout: StageLayout = mode === "custom" ? { mode, shape, video: { x: 8, y: 40, w: shape === "circle" ? 27 : 36 } } : { mode, shape };
  const { slide, video, shape: drawn } = stageBoxes(layout);
  const fill = selected ? "fill-brand" : "fill-ink-faint";
  // The viewBox is 160 × 90, so a percent of width is 1.6 units and a percent of height is 0.9; a circle's box comes out square.
  const vx = video.x * 1.6 + 3;
  const vy = video.y * 0.9 + 3;
  const vw = video.w * 1.6 - 6;
  const vh = video.h * 0.9 - 6;
  return (
    <svg viewBox="0 0 160 90" className="w-full rounded-md bg-surface-inset" aria-hidden>
      {slide && <rect x={slide.x * 1.6 + 3} y={slide.y * 0.9 + 3} width={slide.w * 1.6 - 6} height={slide.h * 0.9 - 6} rx="4" className="fill-line-strong" />}
      {slide && (
        <g className="stroke-surface-raised" strokeWidth="3" strokeLinecap="round">
          <line x1={slide.x * 1.6 + 16} y1={slide.y * 0.9 + 20} x2={slide.x * 1.6 + slide.w * 0.8} y2={slide.y * 0.9 + 20} />
          <line x1={slide.x * 1.6 + 16} y1={slide.y * 0.9 + 32} x2={slide.x * 1.6 + slide.w * 1.1} y2={slide.y * 0.9 + 32} />
        </g>
      )}
      {drawn === "circle" ? (
        <>
          <circle cx={vx + vw / 2} cy={vy + vh / 2} r={Math.min(vw, vh) / 2} className={fill} />
          {mode === "custom" && <circle cx={vx + vw / 2} cy={vy + vh / 2} r={Math.min(vw, vh) / 2} className="fill-none stroke-surface-raised" strokeWidth="2" strokeDasharray="4 3" />}
        </>
      ) : (
        <>
          <rect x={vx} y={vy} width={vw} height={vh} rx="4" className={fill} />
          {mode === "custom" && <rect x={vx} y={vy} width={vw} height={vh} rx="4" className="fill-none stroke-surface-raised" strokeWidth="2" strokeDasharray="4 3" />}
        </>
      )}
    </svg>
  );
}

/** The outline itself, as a little glyph beside its name. */
function ShapeGlyph({ shape }: { shape: StageVideoShape }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {shape === "circle" ? <circle cx="8" cy="8" r="6" /> : <rect x="1.5" y="3.5" width="13" height="9" rx="2" />}
    </svg>
  );
}
