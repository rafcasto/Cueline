/**
 * HLS viewers sit 2–5 s behind the presenters. A cue that fires the instant the
 * presenter advances would arrive before the slide. The player reports its
 * live-edge latency; the client schedules each popup at server_ts + latency.
 */

export type LatencyClock = {
  /** Wall-clock now in ms (Date.now by default; injectable for tests). */
  now: () => number;
  /** Estimated offset between server and client clocks, server - client, in ms. */
  serverOffsetMs: number;
};

export const defaultClock: LatencyClock = { now: () => Date.now(), serverOffsetMs: 0 };

/**
 * Milliseconds to wait before showing an event with the given server timestamp,
 * given the measured player latency. Never negative: late events show at once.
 */
export function delayForEvent(serverTs: string | number | Date, latencyMs: number, clock: LatencyClock = defaultClock): number {
  const ts = typeof serverTs === "number" ? serverTs : new Date(serverTs).getTime();
  if (!Number.isFinite(ts)) return 0;
  const serverNow = clock.now() + clock.serverOffsetMs;
  const elapsed = serverNow - ts;
  const remaining = Math.max(0, latencyMs) - elapsed;
  return Math.max(0, Math.round(remaining));
}

/**
 * Schedules `fn` at server_ts + latency. Returns a cancel function. If the same
 * key is scheduled twice (audience + presenter window both reported it) the
 * earlier timer is kept and the duplicate is dropped.
 */
export function createCueScheduler(getLatencyMs: () => number, clock: LatencyClock = defaultClock) {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule(key: string, serverTs: string | number | Date, fn: () => void): () => void {
      if (pending.has(key)) return () => undefined;
      const delay = delayForEvent(serverTs, getLatencyMs(), clock);
      const t = setTimeout(() => {
        pending.delete(key);
        fn();
      }, delay);
      pending.set(key, t);
      return () => {
        clearTimeout(t);
        pending.delete(key);
      };
    },
    clear() {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    },
    size() {
      return pending.size;
    },
  };
}

/** Clamp a player-reported latency into a sane band so a bad reading can't hold a poll for a minute. */
export function clampLatency(ms: number | undefined | null, fallbackMs = 3000): number {
  if (ms == null || !Number.isFinite(ms)) return fallbackMs;
  return Math.min(15_000, Math.max(0, ms));
}
