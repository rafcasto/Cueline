import { describe, expect, it } from "vitest";
import { currentRun, emptyState, fromSnapshot, latestRun, reduce, runPhase, tallyFor, timeLeftMs, withActivity, wordCloud } from "./session-state";
import type { Activity, ActivityRun, SessionBroadcast } from "./supabase/types";

const msg = (table: string, operation: "INSERT" | "UPDATE" | "DELETE", record: Record<string, unknown> | null, old_record: Record<string, unknown> | null = null): SessionBroadcast => ({
  event: table,
  payload: { operation, table, schema: "public", record, old_record },
});

const quiz: Activity = {
  id: "a1", org_id: "o", room_id: "r", kind: "quiz", title: "Capital?", timer_seconds: 30, points: 1000, sort_order: 0, created_at: "",
  options: [{ id: "x", label: "Auckland" }, { id: "y", label: "Wellington", correct: true }], config: {},
};
const run = (over: Partial<ActivityRun> = {}): ActivityRun => ({
  id: "run1", org_id: "o", session_id: "s", activity_id: "a1", opened_at: "2026-09-30T10:00:00Z", closes_at: "2026-09-30T10:00:30Z",
  closed_at: null, results_shown_at: null, hidden_at: null, ...over,
});

describe("reduce", () => {
  it("tracks a run, tallies votes and dedupes users", () => {
    let s = fromSnapshot({ activities: [quiz] });
    s = reduce(s, msg("activity_runs", "INSERT", run() as unknown as Record<string, unknown>));
    expect(currentRun(s)?.id).toBe("run1");
    s = reduce(s, msg("activity_responses", "INSERT", { id: "r1", run_id: "run1", user_id: "u1", option_ids: ["y"], text_answer: null }), "u1");
    s = reduce(s, msg("activity_responses", "INSERT", { id: "r2", run_id: "run1", user_id: "u2", option_ids: ["y"], text_answer: null }), "u1");
    s = reduce(s, msg("activity_responses", "INSERT", { id: "r3", run_id: "run1", user_id: "u3", option_ids: ["x"], text_answer: null }), "u1");
    const dup = reduce(s, msg("activity_responses", "INSERT", { id: "r4", run_id: "run1", user_id: "u3", option_ids: ["x"], text_answer: null }), "u1");
    expect(dup).toBe(s);
    expect(s.myResponses.run1?.id).toBe("r1");
    const t = tallyFor(s, s.runs.run1);
    expect(t.total).toBe(3);
    expect(t.rows.map((r) => [r.label, r.votes, r.pct, r.correct ?? false])).toEqual([["Auckland", 1, 33, false], ["Wellington", 2, 67, true]]);
  });

  it("hiding the latest run clears the overlay without resurfacing an older run; showing it again brings it back", () => {
    let s = fromSnapshot({ activities: [quiz], runs: [run(), run({ id: "run2", opened_at: "2026-09-30T10:05:00Z" })] });
    expect(currentRun(s)?.id).toBe("run2");
    const hidden = run({ id: "run2", opened_at: "2026-09-30T10:05:00Z", hidden_at: "2026-09-30T10:06:00Z" });
    s = reduce(s, msg("activity_runs", "UPDATE", hidden as unknown as Record<string, unknown>));
    expect(currentRun(s)).toBeNull();
    expect(latestRun(s)?.id).toBe("run2");
    s = reduce(s, msg("activity_runs", "UPDATE", { ...hidden, hidden_at: null } as unknown as Record<string, unknown>));
    expect(currentRun(s)?.id).toBe("run2");
  });

  it("a run for an activity the snapshot did not have shows once the activity is merged in", () => {
    let s = fromSnapshot({ activities: [] });
    s = reduce(s, msg("activity_runs", "INSERT", run() as unknown as Record<string, unknown>));
    expect(currentRun(s)?.id).toBe("run1");
    expect(s.activities[currentRun(s)!.activity_id]).toBeUndefined();
    s = withActivity(s, quiz);
    expect(s.activities.a1.title).toBe("Capital?");
  });

  it("session state changes flow through", () => {
    const s = reduce(emptyState, msg("sessions", "UPDATE", { id: "s", state: "live" }));
    expect(s.session?.state).toBe("live");
  });

  it("tracks the hand-raise queue in raise order and clears on update", () => {
    let s = reduce(emptyState, msg("hand_raises", "INSERT", { id: "h2", user_id: "b", raised_at: "2026-09-27T10:00:02Z", cleared_at: null }));
    s = reduce(s, msg("hand_raises", "INSERT", { id: "h1", user_id: "a", raised_at: "2026-09-27T10:00:01Z", cleared_at: null }));
    expect(s.handRaises.map((h) => h.user_id)).toEqual(["a", "b"]);
    s = reduce(s, msg("hand_raises", "UPDATE", { id: "h1", user_id: "a", raised_at: "2026-09-27T10:00:01Z", cleared_at: "2026-09-27T10:01:00Z" }));
    expect(s.handRaises.map((h) => h.user_id)).toEqual(["b"]);
  });

  it("keeps roster and participants per user and ignores unknown tables", () => {
    let s = reduce(emptyState, msg("stage_roster", "INSERT", { id: "r", user_id: "u", state: "invited" }));
    s = reduce(s, msg("stage_roster", "UPDATE", { id: "r", user_id: "u", state: "live" }));
    s = reduce(s, msg("participants", "INSERT", { session_id: "s", user_id: "u", display_name: "Ada" }));
    expect(s.roster.u.state).toBe("live");
    expect(s.participants.u.display_name).toBe("Ada");
    expect(reduce(s, msg("orders", "INSERT", { id: "x" }))).toBe(s);
  });
});

describe("run phases and timers", () => {
  const t0 = new Date("2026-09-30T10:00:10Z").getTime();
  it("is open before the timer, closed after, results when shown", () => {
    expect(runPhase(run(), t0)).toBe("open");
    expect(timeLeftMs(run(), t0)).toBe(20_000);
    expect(runPhase(run(), t0 + 25_000)).toBe("closed");
    expect(timeLeftMs(run(), t0 + 25_000)).toBe(0);
    expect(runPhase(run({ closed_at: "2026-09-30T10:00:15Z" }), t0)).toBe("closed");
    expect(runPhase(run({ closed_at: "2026-09-30T10:00:15Z", results_shown_at: "2026-09-30T10:00:16Z" }), t0)).toBe("results");
    expect(timeLeftMs(run({ closes_at: null }), t0)).toBeNull();
  });
});

describe("wordCloud", () => {
  it("counts words, drops stop words, sorts by frequency", () => {
    expect(wordCloud(["Hiring is the blocker", "hiring and budget", "Budget"]).slice(0, 2)).toEqual([
      { word: "budget", count: 2 },
      { word: "hiring", count: 2 },
    ]);
  });
});
