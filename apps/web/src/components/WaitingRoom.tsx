"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import type { WaitingRoom as WaitingRoomConfig, WaitingRoomElement } from "@/lib/supabase/types";
import { DEFAULT_VOLUME, normalizeWaitingRoom, soundSource } from "@/lib/waiting-room";

type Props = {
  config: WaitingRoomConfig;
  className?: string;
  children?: React.ReactNode;
  /** Play the music (or the video's own sound) with a tap-for-sound button and a mute toggle. Off where the canvas is only a backdrop. */
  withSound?: boolean;
  /** Try to start the sound as soon as the browser allows it; the editor passes false so the host opts in. */
  autoplaySound?: boolean;
};

/** `pending` is the first play attempt, `blocked` means the browser wants a tap first. */
type SoundState = "pending" | "blocked" | "on" | "off";

/**
 * Renders the waiting room on a 16:9 canvas: a picture or a looping video, optional
 * music, and text elements positioned in percent like a slide.
 *
 * Browsers only let sound start after the page has had a tap. Attendees who came through
 * the invite page's button already have one, so the music just starts; anyone who landed
 * cold sees "Tap for sound" at the bottom of the canvas. Either way a mute toggle sits in
 * the corner, and everything stops the moment this unmounts (go live, or room closed).
 */
export function WaitingRoom({ config: raw, className, children, withSound = false, autoplaySound = true }: Props) {
  const config = useMemo(() => normalizeWaitingRoom(raw), [raw]);
  const bg = config.background;
  const source = withSound ? soundSource(bg) : null;
  const volume = bg.volume ?? DEFAULT_VOLUME;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const volumeRef = useRef(volume);
  // Whether the attendee wants sound; survives the media changing underneath (editor uploads).
  const wanted = useRef(autoplaySound);
  const [sound, setSound] = useState<SoundState>(autoplaySound ? "pending" : "off");

  const media = useCallback(() => (source === "video" ? videoRef.current : source === "track" ? audioRef.current : null), [source]);

  const start = useCallback(
    async (fromTap: boolean) => {
      const m = media();
      if (!m) return;
      // Without a gesture on record, don't even try: unmuting an autoplaying video makes Chrome pause it.
      if (!fromTap && !hadGesture()) {
        setSound("blocked");
        return;
      }
      m.volume = volumeRef.current;
      m.muted = false;
      try {
        await m.play();
        setSound("on");
      } catch {
        m.muted = true;
        if (m instanceof HTMLVideoElement) void m.play().catch(() => undefined);
        setSound("blocked");
      }
    },
    [media],
  );

  useEffect(() => {
    volumeRef.current = volume;
    const m = media();
    if (m) m.volume = volume;
  }, [volume, media]);

  useEffect(() => {
    if (!source) return;
    if (wanted.current) void start(false);
  }, [source, bg.audio_url, bg.video_url, start]);

  const toggle = () => {
    const m = media();
    if (!m) return;
    if (sound === "on") {
      wanted.current = false;
      m.muted = true;
      setSound("off");
    } else {
      wanted.current = true;
      void start(true);
    }
  };

  return (
    <div className={cx("relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 text-white", className)}>
      {bg.type === "video" && bg.video_url ? (
        <video ref={videoRef} key={bg.video_url} src={bg.video_url} poster={bg.image_url} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline controls={false} />
      ) : bg.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {source === "track" && <audio ref={audioRef} key={bg.audio_url} src={bg.audio_url} loop preload="auto" />}
      {config.elements.map((el) => (
        <div key={el.id} className="absolute flex items-center whitespace-pre-wrap break-words" style={elementStyle(el)}>
          <span className="w-full">{el.text}</span>
        </div>
      ))}
      {children}
      {source && sound === "blocked" && (
        <button
          type="button"
          onClick={toggle}
          className="absolute bottom-4 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white shadow-overlay ring-1 ring-white/30 backdrop-blur transition-colors hover:bg-black/75"
        >
          <SpeakerIcon muted />
          Tap for sound
        </button>
      )}
      {source && (sound === "on" || sound === "off") && (
        <button
          type="button"
          onClick={toggle}
          aria-label={sound === "on" ? "Mute" : "Unmute"}
          aria-pressed={sound === "off"}
          className="absolute bottom-3 right-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/30 backdrop-blur transition-colors hover:bg-black/70"
        >
          <SpeakerIcon muted={sound !== "on"} />
        </button>
      )}
    </div>
  );
}

/** Position and type for one text box; the editor uses the same styles for its draggable copies. */
export function elementStyle(el: WaitingRoomElement): React.CSSProperties {
  return {
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
  };
}

/** Sticky activation: true once the page has had any tap or key press, which SPA navigation from the invite page preserves. */
function hadGesture() {
  if (typeof navigator === "undefined") return true;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  );
}
