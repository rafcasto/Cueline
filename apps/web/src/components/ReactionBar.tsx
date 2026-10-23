"use client";
import { useEffect, useRef, useState } from "react";
import { REACTION_KINDS, type ReactionKind } from "@/lib/supabase/types";

export const REACTION_EMOJI: Record<ReactionKind, string> = { like: "👍", heart: "❤️", laugh: "😂", sad: "😢", wow: "😮", clap: "👏" };

type Props = {
  onFlush: (kind: ReactionKind, count: number) => Promise<void>;
  /** Latest per-second bucket from the broadcast; drives the floating animation for everyone. */
  lastReaction: { kind: string; count: number; bucket_ts: string } | null;
  disabled?: boolean;
};

/** Always-on reactions. Taps batch client-side and flush once per second via bump_reaction(). */
export function ReactionBar({ onFlush, lastReaction, disabled }: Props) {
  const pending = useRef<Partial<Record<ReactionKind, number>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [floating, setFloating] = useState<{ id: number; kind: ReactionKind; x: number }[]>([]);
  const seq = useRef(0);

  const float = (kind: ReactionKind, n: number) => {
    const items = Array.from({ length: Math.min(n, 6) }, () => ({ id: seq.current++, kind, x: 10 + Math.random() * 80 }));
    setFloating((f) => [...f, ...items].slice(-40));
    setTimeout(() => setFloating((f) => f.filter((i) => !items.some((j) => j.id === i.id))), 2500);
  };

  const tap = (kind: ReactionKind) => {
    float(kind, 1);
    pending.current[kind] = (pending.current[kind] ?? 0) + 1;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      const batch = pending.current;
      pending.current = {};
      timer.current = null;
      for (const [k, n] of Object.entries(batch)) void onFlush(k as ReactionKind, n ?? 0).catch(() => undefined);
    }, 1000);
  };

  // Other people's reactions arrive as bucket updates; animate the delta.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!lastReaction) return;
    const key = `${lastReaction.kind}:${lastReaction.bucket_ts}:${lastReaction.count}`;
    if (seen.current === key) return;
    seen.current = key;
    if (REACTION_KINDS.includes(lastReaction.kind as ReactionKind)) float(lastReaction.kind as ReactionKind, 1);
  }, [lastReaction]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-48 overflow-hidden">
        {floating.map((f) => (
          <span key={f.id} className="absolute bottom-0 animate-[float_2.4s_ease-out_forwards] text-2xl" style={{ left: `${f.x}%` }}>
            {REACTION_EMOJI[f.kind]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Reactions">
        {REACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            onClick={() => tap(kind)}
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-raised text-lg shadow-card transition-transform hover:scale-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            title={kind}
            aria-label={kind}
          >
            {REACTION_EMOJI[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}
