import { describe, expect, it } from "vitest";
import { emptyState, fromSnapshot, reduce, tallyFor, wordCloud } from "./session-state";
import type { SessionBroadcast } from "./supabase/types";

const msg = (table: string, operation: "INSERT" | "UPDATE" | "DELETE", record: Record<string, unknown> | null, old_record: Record<string, unknown> | null = null): SessionBroadcast => ({
  event: table,
  payload: { operation, table, schema: "public", record, old_record },
});

describe("reduce", () => {
  it("opens a poll from a slide event, collects options and tallies votes", () => {
    let s = emptyState;
    s = reduce(s, msg("polls", "INSERT", { id: "p1", session_id: "s", kind: "poll", question: "Q?", slide_object_id: "g1", opened_at: "", closed_at: null }));
    s = reduce(s, msg("poll_options", "INSERT", { id: "o2", poll_id: "p1", index: 1, label: "B" }));
    s = reduce(s, msg("poll_options", "INSERT", { id: "o1", poll_id: "p1", index: 0, label: "A" }));
    s = reduce(s, msg("slide_events", "INSERT", { id: "e1", session_id: "s", slide_object_id: "g1", index: 3, server_ts: "", forced: false, poll_id: "p1", cta_id: null }));
    expect(s.activePollId).toBe("p1");
    expect(s.options.p1.map((o) => o.label)).toEqual(["A", "B"]);

    s = reduce(s, msg("poll_responses", "INSERT", { id: "r1", poll_id: "p1", user_id: "u1", option_ids: ["o1"], text_answer: null }));
    s = reduce(s, msg("poll_responses", "INSERT", { id: "r2", poll_id: "p1", user_id: "u2", option_ids: ["o1"], text_answer: null }));
    s = reduce(s, msg("poll_responses", "INSERT", { id: "r3", poll_id: "p1", user_id: "u3", option_ids: ["o2"], text_answer: null }));
    const dup = reduce(s, msg("poll_responses", "INSERT", { id: "r4", poll_id: "p1", user_id: "u3", option_ids: ["o2"], text_answer: null }));
    expect(dup).toBe(s);
    const t = tallyFor(s, "p1");
    expect(t.total).toBe(3);
    expect(t.rows.map((r) => [r.label, r.votes, r.pct])).toEqual([["A", 2, 67], ["B", 1, 33]]);
  });

  it("a slide without a cue clears the active poll and cta", () => {
    let s = reduce(emptyState, msg("slide_events", "INSERT", { id: "e1", poll_id: "p1", cta_id: "c1", slide_object_id: "g1" }));
    expect(s.activePollId).toBe("p1");
    s = reduce(s, msg("slide_events", "INSERT", { id: "e2", poll_id: null, cta_id: null, slide_object_id: "g2" }));
    expect(s.activePollId).toBeNull();
    expect(s.activeCtaId).toBeNull();
  });

  it("tracks the hand-raise queue in raise order and clears on update", () => {
    let s = reduce(emptyState, msg("hand_raises", "INSERT", { id: "h2", user_id: "b", raised_at: "2026-09-27T10:00:02Z", cleared_at: null }));
    s = reduce(s, msg("hand_raises", "INSERT", { id: "h1", user_id: "a", raised_at: "2026-09-27T10:00:01Z", cleared_at: null }));
    expect(s.handRaises.map((h) => h.user_id)).toEqual(["a", "b"]);
    s = reduce(s, msg("hand_raises", "UPDATE", { id: "h1", user_id: "a", raised_at: "2026-09-27T10:00:01Z", cleared_at: "2026-09-27T10:01:00Z" }));
    expect(s.handRaises.map((h) => h.user_id)).toEqual(["b"]);
  });

  it("keeps roster state per user and ignores unknown tables", () => {
    let s = reduce(emptyState, msg("stage_roster", "INSERT", { id: "r", user_id: "u", state: "invited" }));
    s = reduce(s, msg("stage_roster", "UPDATE", { id: "r", user_id: "u", state: "live" }));
    expect(s.roster.u.state).toBe("live");
    expect(reduce(s, msg("orders", "INSERT", { id: "x" }))).toBe(s);
  });
});

describe("fromSnapshot and wordCloud", () => {
  it("builds state from an initial fetch", () => {
    const s = fromSnapshot({
      polls: [{ id: "p1", session_id: "s", kind: "text", question: "Q", slide_object_id: null, opened_at: "", closed_at: null }],
      tallies: [{ poll_id: "p1", option_id: "o1", votes: 4 }],
      lastSlide: { id: "e", session_id: "s", slide_object_id: "g", index: 0, server_ts: "", forced: false, poll_id: "p1", cta_id: null },
    });
    expect(s.activePollId).toBe("p1");
    expect(s.votes.p1.o1).toBe(4);
  });

  it("counts words, drops stop words, sorts by frequency", () => {
    expect(wordCloud(["Hiring is the blocker", "hiring and budget", "Budget"]).slice(0, 2)).toEqual([
      { word: "budget", count: 2 },
      { word: "hiring", count: 2 },
    ]);
  });
});
