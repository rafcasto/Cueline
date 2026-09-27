import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampLatency, createCueScheduler, delayForEvent } from "./latency";

describe("delayForEvent", () => {
  const clock = { now: () => 10_000, serverOffsetMs: 0 };

  it("waits the full latency for an event that just happened", () => {
    expect(delayForEvent(10_000, 3000, clock)).toBe(3000);
  });

  it("subtracts time already elapsed since server_ts", () => {
    expect(delayForEvent(9_000, 3000, clock)).toBe(2000);
  });

  it("never goes negative for late events", () => {
    expect(delayForEvent(1_000, 3000, clock)).toBe(0);
  });

  it("accounts for server/client clock offset", () => {
    // Server is 500ms ahead of the client; an event stamped at server 10_500 is "now".
    expect(delayForEvent(10_500, 3000, { now: () => 10_000, serverOffsetMs: 500 })).toBe(3000);
  });

  it("accepts ISO strings and treats junk as immediate", () => {
    expect(delayForEvent(new Date(10_000).toISOString(), 1000, clock)).toBe(1000);
    expect(delayForEvent("not a date", 1000, clock)).toBe(0);
  });
});

describe("clampLatency", () => {
  it("falls back and clamps", () => {
    expect(clampLatency(undefined)).toBe(3000);
    expect(clampLatency(NaN, 2500)).toBe(2500);
    expect(clampLatency(-5)).toBe(0);
    expect(clampLatency(60_000)).toBe(15_000);
    expect(clampLatency(4200)).toBe(4200);
  });
});

describe("createCueScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after the latency and dedupes by key", () => {
    const now = Date.now();
    const scheduler = createCueScheduler(() => 2000, { now: () => now, serverOffsetMs: 0 });
    const fn = vi.fn();
    scheduler.schedule("evt-1", now, fn);
    scheduler.schedule("evt-1", now, fn); // presenter-view duplicate
    expect(scheduler.size()).toBe(1);
    vi.advanceTimersByTime(1999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(scheduler.size()).toBe(0);
  });

  it("cancel prevents firing", () => {
    const now = Date.now();
    const scheduler = createCueScheduler(() => 1000, { now: () => now, serverOffsetMs: 0 });
    const fn = vi.fn();
    const cancel = scheduler.schedule("evt-2", now, fn);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
