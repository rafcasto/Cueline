import { describe, expect, it } from "vitest";
import { average, byQuadrant, engagementScore, eventFunnels, fitScore, hasFitScoring, optionFit, quadrantOf, scoreAttendees, sessionsForEvent, signalSummary, totalFunnel, withFit } from "./insights";
import type { SessionEngagement } from "./supabase/types";

const row = (patch: Partial<SessionEngagement> = {}): SessionEngagement => ({
  session_id: "s1",
  user_id: "u1",
  display_name: "Ada",
  joined_at: "2026-11-20T10:00:00Z",
  runs_total: 4,
  cta_runs: 1,
  answers: 0,
  questions: 0,
  upvotes: 0,
  chat_messages: 0,
  hand_raises: 0,
  reactions: 0,
  cta_views: 0,
  cta_taps: 0,
  orders_paid: 0,
  fit_points: 0,
  fit_max: 20,
  ...patch,
});

describe("fit on an option", () => {
  it("is a whole number from 0 to 10", () => {
    expect(optionFit({ fit: 7 })).toBe(7);
    expect(optionFit({ fit: 7.6 })).toBe(8);
    expect(optionFit({ fit: 40 })).toBe(10);
    expect(optionFit({ fit: -2 })).toBe(0);
    expect(optionFit({})).toBe(0);
    expect(optionFit({ fit: Number.NaN })).toBe(0);
  });
  it("is kept on save only where it is above zero", () => {
    expect(withFit([{ id: "a", label: "A", fit: 5 }, { id: "b", label: "B", fit: 0 }, { id: "c", label: "C" }])).toEqual([{ id: "a", label: "A", fit: 5 }, { id: "b", label: "B" }, { id: "c", label: "C" }]);
    expect(hasFitScoring([{ fit: 0 }, {}])).toBe(false);
    expect(hasFitScoring([{ fit: 0 }, { fit: 3 }])).toBe(true);
  });
});

describe("fitScore", () => {
  it("is the share of the best possible, and unknown when nothing scored fit", () => {
    expect(fitScore({ fit_points: 15, fit_max: 20 })).toBe(75);
    expect(fitScore({ fit_points: 0, fit_max: 20 })).toBe(0);
    expect(fitScore({ fit_points: 0, fit_max: 0 })).toBeNull();
  });
});

describe("engagementScore", () => {
  it("gives someone who only turned up a low score and someone who did everything the top", () => {
    expect(engagementScore(row())).toBeLessThan(15);
    expect(engagementScore(row({ answers: 4, questions: 2, chat_messages: 3, upvotes: 2, reactions: 5, hand_raises: 1, cta_taps: 1 }))).toBe(100);
  });
  it("does not hold a session's missing polls or calls to action against anyone", () => {
    const quiet = row({ runs_total: 0, cta_runs: 0, questions: 1, chat_messages: 3 });
    const same = row({ runs_total: 4, cta_runs: 1, questions: 1, chat_messages: 3 });
    expect(engagementScore(quiet)).toBeGreaterThan(engagementScore(same));
  });
  it("ranks a tap above an answer and a paid order as 100", () => {
    expect(engagementScore(row({ cta_taps: 1 }))).toBeGreaterThan(engagementScore(row({ answers: 2 })));
    expect(engagementScore(row({ orders_paid: 1 }))).toBe(100);
  });
  it("caps every signal", () => {
    expect(engagementScore(row({ chat_messages: 300 }))).toBe(engagementScore(row({ chat_messages: 3 })));
    expect(engagementScore(row({ answers: 9 }))).toBe(engagementScore(row({ answers: 4 })));
  });
});

describe("signalSummary", () => {
  it("says what the person did in a few words", () => {
    expect(signalSummary(row({ answers: 3, questions: 1, cta_taps: 1 }))).toEqual(["tapped the call to action", "3 of 4 answers", "1 question"]);
    expect(signalSummary(row({ runs_total: 0, cta_runs: 0 }))).toEqual([]);
  });
});

describe("quadrants", () => {
  it("split on the thresholds", () => {
    expect(quadrantOf(50, 50)).toBe("hot");
    expect(quadrantOf(80, 10)).toBe("eager");
    expect(quadrantOf(10, 80)).toBe("nurture");
    expect(quadrantOf(10, 10)).toBe("cold");
    expect(quadrantOf(60, 30, { engagement: 70, fit: 20 })).toBe("nurture");
  });
  it("score and group every attendee, most engaged first, with the fit unknown when nothing scored it", () => {
    const list = scoreAttendees([
      row({ user_id: "a", display_name: "Ada", answers: 4, cta_taps: 1, fit_points: 18 }),
      row({ user_id: "b", display_name: "Bob", fit_points: 20 }),
      row({ user_id: "c", display_name: "Cy", fit_points: 0, fit_max: 0 }),
    ]);
    expect(list.map((a) => a.display_name)).toEqual(["Ada", "Bob", "Cy"]);
    expect(list[0]).toMatchObject({ fit: 90, quadrant: "hot" });
    expect(list[1]).toMatchObject({ fit: 100, quadrant: "nurture" });
    expect(list[2]).toMatchObject({ fit: null, quadrant: null });
    const groups = byQuadrant(list);
    expect(groups.hot.map((a) => a.user_id)).toEqual(["a"]);
    expect(groups.nurture.map((a) => a.user_id)).toEqual(["b"]);
    expect(groups.cold).toEqual([]);
    expect(average(list.map((a) => a.engagement))).toBeGreaterThan(0);
    expect(average([])).toBeNull();
  });
});

describe("registered against attended", () => {
  const event = (patch: Partial<Parameters<typeof sessionsForEvent>[0]> = {}) => ({ id: "e1", title: "Launch", starts_at: "2026-11-20T10:00:00Z", created_at: "2026-11-01T00:00:00Z", revoked_at: null, ...patch });
  const session = (id: string, started_at: string | null) => ({ id, started_at, created_at: started_at ?? "2026-11-20T09:00:00Z", state: "ended" });

  it("matches a timed event to the sessions that started near it", () => {
    const near = session("s1", "2026-11-20T10:05:00Z");
    const far = session("s2", "2026-11-27T10:00:00Z");
    const never = session("s3", null);
    expect(sessionsForEvent(event(), [near, far, never])).toEqual([near]);
  });
  it("matches an untimed event to the sessions while its link was live", () => {
    const before = session("s0", "2026-10-30T10:00:00Z");
    const during = session("s1", "2026-11-05T10:00:00Z");
    const after = session("s2", "2026-12-05T10:00:00Z");
    expect(sessionsForEvent(event({ starts_at: null }), [before, during, after])).toEqual([during, after]);
    expect(sessionsForEvent(event({ starts_at: null, revoked_at: "2026-11-30T00:00:00Z" }), [before, during, after])).toEqual([during]);
  });
  it("counts who turned up out of who registered", () => {
    const regs = [
      { invite_id: "e1", user_id: "a", waitlisted_at: null, cancelled_at: null },
      { invite_id: "e1", user_id: "b", waitlisted_at: null, cancelled_at: null },
      { invite_id: "e1", user_id: "c", waitlisted_at: "2026-11-02T00:00:00Z", cancelled_at: null },
      { invite_id: "e1", user_id: "d", waitlisted_at: null, cancelled_at: "2026-11-03T00:00:00Z" },
      { invite_id: "e2", user_id: "e", waitlisted_at: null, cancelled_at: null },
    ];
    const [f] = eventFunnels([event()], regs, [session("s1", "2026-11-20T10:05:00Z")], { s1: ["a", "c", "d", "zz"] });
    expect(f).toMatchObject({ registered: 3, seated: 2, waiting: 1, cancelled: 1, attended: 2, showUp: 67 });
    expect(totalFunnel([f, { ...f, registered: 1, attended: 0 }])).toMatchObject({ registered: 4, attended: 2, showUp: 50 });
    expect(eventFunnels([event({ id: "e3" })], regs, [], {})[0].showUp).toBeNull();
  });
});
