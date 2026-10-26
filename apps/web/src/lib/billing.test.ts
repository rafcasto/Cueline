import { describe, expect, it } from "vitest";
import { billingPeriod, decideGoLive, effectivePlan, endsBy, isFalseStart, roomAccess, type Usage } from "./billing";
import { PLAN_LIMITS } from "./plans";

const open = roomAccess({ plan: "free", plan_status: "active" }, 1);
const usage = (over: Partial<Usage>): Usage => ({
  period: { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-01T00:00:00Z") },
  used: 0,
  limits: PLAN_LIMITS.free,
  effectivePlan: "free",
  access: open,
  ...over,
});

describe("billingPeriod", () => {
  it("is the calendar month for a free room", () => {
    const p = billingPeriod({}, new Date("2026-10-25T12:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("follows the subscription's period for a monthly plan", () => {
    const p = billingPeriod({ plan_period_start: "2026-10-10T09:00:00Z", plan_period_end: "2026-11-10T09:00:00Z" }, new Date("2026-10-25T12:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-10-10T09:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-10T09:00:00.000Z");
  });
  it("resets monthly on the start day inside a yearly period", () => {
    const row = { plan_period_start: "2026-01-31T09:00:00Z", plan_period_end: "2027-01-31T09:00:00Z" };
    const p = billingPeriod(row, new Date("2026-03-15T00:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-02-28T09:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-03-31T09:00:00.000Z");
    const last = billingPeriod(row, new Date("2027-01-15T00:00:00Z"));
    expect(last.end.toISOString()).toBe("2027-01-31T09:00:00.000Z");
  });
  it("falls back to the calendar month when Stripe has not reported a period", () => {
    const p = billingPeriod({ plan_period_start: null }, new Date("2026-10-25T12:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("roomAccess", () => {
  it("is free and open for an organisation's only room", () => {
    expect(open).toMatchObject({ tier: "free", locked: false, paid: false });
  });
  it("is paid while active or past due, whatever the room count", () => {
    expect(roomAccess({ plan: "starter", plan_status: "active" }, 3)).toMatchObject({ tier: "starter", locked: false, paid: true });
    expect(roomAccess({ plan: "pro", plan_status: "past_due" }, 3)).toMatchObject({ tier: "pro", locked: false, paid: true });
  });
  it("locks a room without a plan when the organisation has other rooms", () => {
    const lapsed = roomAccess({ plan: "starter", plan_status: "canceled" }, 2);
    expect(lapsed).toMatchObject({ tier: "free", locked: true, paid: false });
    expect(lapsed.reason).toContain("other rooms");
    const unpaid = roomAccess({ plan: "pro", plan_status: "unpaid" }, 2);
    expect(unpaid.locked).toBe(true);
    expect(unpaid.reason).toContain("payment");
  });
  it("frees a lapsed room again once it is the only one left", () => {
    expect(roomAccess({ plan: "starter", plan_status: "canceled" }, 1)).toMatchObject({ tier: "free", locked: false });
  });
  it("runs a complimentary room at Pro, never locked", () => {
    expect(roomAccess({ plan: "free", plan_status: "active", complimentary: true }, 5)).toMatchObject({ tier: "pro", locked: false, paid: false, complimentary: true });
  });
});

describe("decideGoLive", () => {
  it("lets a free room run its one session", () => {
    expect(decideGoLive(usage({}))).toEqual({ allowed: true, limits: PLAN_LIMITS.free });
  });
  it("refuses the second free session with the reset date", () => {
    const d = decideGoLive(usage({ used: 1 }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toContain("2026-11-01");
  });
  it("refuses the fifth Starter session and points at Pro", () => {
    const starter = roomAccess({ plan: "starter", plan_status: "active" }, 1);
    const d = decideGoLive(usage({ used: 4, limits: PLAN_LIMITS.starter, effectivePlan: "starter", access: starter }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toContain("Pro");
    expect(decideGoLive(usage({ used: 3, limits: PLAN_LIMITS.starter, effectivePlan: "starter", access: starter }))).toEqual({ allowed: true, limits: PLAN_LIMITS.starter });
  });
  it("never caps Pro", () => {
    expect(decideGoLive(usage({ used: 400, limits: PLAN_LIMITS.pro, effectivePlan: "pro", access: roomAccess({ plan: "pro", plan_status: "active" }, 1) })).allowed).toBe(true);
  });
  it("never lets a locked room go live", () => {
    const d = decideGoLive(usage({ access: roomAccess({ plan: "starter", plan_status: "canceled" }, 2) }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toContain("other rooms");
  });
});

describe("plan status", () => {
  it("keeps the plan while past due and drops to free once cancelled or unpaid", () => {
    expect(effectivePlan({ plan: "pro", plan_status: "past_due" })).toBe("pro");
    expect(effectivePlan({ plan: "pro", plan_status: "canceled" })).toBe("free");
    expect(effectivePlan({ plan: "pro", plan_status: "unpaid" })).toBe("free");
  });
});

describe("false starts and the hard stop", () => {
  const s = { started_at: "2026-10-25T10:00:00Z", ended_at: "2026-10-25T10:01:30Z" };
  it("refunds a short session nobody joined, once", () => {
    expect(isFalseStart(s, 0, 0)).toBe(true);
    expect(isFalseStart(s, 1, 0)).toBe(false);
    expect(isFalseStart(s, 0, 1)).toBe(false);
    expect(isFalseStart({ ...s, ended_at: "2026-10-25T10:02:01Z" }, 0, 0)).toBe(false);
  });
  it("ends the session after the plan's minutes", () => {
    expect(endsBy(new Date("2026-10-25T10:00:00Z"), PLAN_LIMITS.free).toISOString()).toBe("2026-10-25T10:20:00.000Z");
    expect(endsBy(new Date("2026-10-25T10:00:00Z"), PLAN_LIMITS.pro).toISOString()).toBe("2026-10-25T14:00:00.000Z");
  });
});
