"use client";
import type { WaitingRoom as WaitingRoomConfig } from "@/lib/supabase/types";

/**
 * Renders the waiting room on a 16:9 canvas: background image, video, or image
 * plus audio, with text elements positioned in percent like a slide.
 */
export function WaitingRoom({ config, className, children }: { config: WaitingRoomConfig; className?: string; children?: React.ReactNode }) {
  const bg = config.background;
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 text-white ${className ?? ""}`}>
      {bg.type === "video" && bg.video_url ? (
        <video src={bg.video_url} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline controls={false} />
      ) : bg.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {bg.type === "image_audio" && bg.audio_url && <audio src={bg.audio_url} autoPlay loop controls className="absolute bottom-2 left-2 z-10 h-8 opacity-70" />}
      {config.elements.map((el) => (
        <div
          key={el.id}
          className="absolute flex items-center whitespace-pre-wrap break-words"
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            width: `${el.w}%`,
            height: `${el.h}%`,
            fontSize: `${el.fontSize}cqh`,
            color: el.color,
            textAlign: el.align,
            fontWeight: el.weight,
            justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
            textShadow: "0 1px 3px rgba(0,0,0,.5)",
          }}
        >
          <span className="w-full">{el.text}</span>
        </div>
      ))}
      {children}
    </div>
  );
}
