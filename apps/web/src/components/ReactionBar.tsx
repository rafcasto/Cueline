"use client";
import { useRef } from "react";

const KINDS: [string, string][] = [["clap", "👏"], ["heart", "❤️"], ["laugh", "😂"], ["wow", "😮"]];

/** Taps are batched client-side and flushed once per second via bump_reaction(); rows are per-second counts, never per tap. */
export function ReactionBar({ onFlush, counts }: { onFlush: (kind: string, count: number) => Promise<void>; counts: Record<string, number> }) {
  const pending = useRef<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tap = (kind: string) => {
    pending.current[kind] = (pending.current[kind] ?? 0) + 1;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      const batch = pending.current;
      pending.current = {};
      timer.current = null;
      for (const [k, n] of Object.entries(batch)) void onFlush(k, n).catch(() => undefined);
    }, 1000);
  };

  return (
    <div className="flex gap-2">
      {KINDS.map(([kind, emoji]) => (
        <button key={kind} onClick={() => tap(kind)} className="rounded-full border px-3 py-1 text-lg hover:bg-neutral-100 dark:hover:bg-neutral-800" title={kind}>
          {emoji} <span className="text-xs tabular-nums text-neutral-500">{counts[kind] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
