import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "./plans";
import { capacityFor, parseCapacity, registrationStatus, seatSummary, stepKindsFor, waitlistPosition } from "./seats";

const seated = { waitlisted_at: null, cancelled_at: null };
const waiting = (at: string) => ({ waitlisted_at: at, cancelled_at: null });
const gone = { waitlisted_at: null, cancelled_at: "2026-10-26T10:00:00Z" };

describe("capacityFor", () => {
  it("is the plan's cap when the host set nothing", () => {
    expect(capacityFor({ capacity: null }, PLAN_LIMITS.starter)).toBe(50);
  });
  it("keeps the host's number within the plan", () => {
    expect(capacityFor({ capacity: 20 }, PLAN_LIMITS.starter)).toBe(20);
    expect(capacityFor({ capacity: 500 }, PLAN_LIMITS.starter)).toBe(50);
    expect(capacityFor({ capacity: 40 }, PLAN_LIMITS.free)).toBe(10);
  });
});

describe("parseCapacity", () => {
  it("accepts a blank as the plan default and whole numbers up to the cap", () => {
    expect(parseCapacity("", PLAN_LIMITS.pro)).toEqual({ capacity: null });
    expect(parseCapacity(null, PLAN_LIMITS.pro)).toEqual({ capacity: null });
    expect(parseCapacity("25", PLAN_LIMITS.pro)).toEqual({ capacity: 25 });
    expect(parseCapacity(150, PLAN_LIMITS.pro)).toEqual({ capacity: 150 });
  });
  it("names the plan's cap when asked for more", () => {
    expect(parseCapacity(11, PLAN_LIMITS.free)).toEqual({ error: expect.stringContaining("up to 10") });
    expect(parseCapacity(0, PLAN_LIMITS.free)).toEqual({ error: expect.stringContaining("1 or more") });
    expect(parseCapacity("ten", PLAN_LIMITS.free)).toEqual({ error: expect.stringContaining("whole number") });
  });
});

describe("seatSummary", () => {
  it("counts seats, the queue and what is left", () => {
    const s = seatSummary([seated, seated, waiting("2026-10-26T09:00:00Z"), gone], 2);
    expect(s).toEqual({ capacity: 2, going: 2, waiting: 1, left: 0, full: true });
    expect(seatSummary([seated], 10)).toMatchObject({ going: 1, left: 9, full: false });
  });
});

describe("registrationStatus and waitlistPosition", () => {
  it("reads the row", () => {
    expect(registrationStatus(seated)).toBe("seated");
    expect(registrationStatus(waiting("x"))).toBe("waitlisted");
    expect(registrationStatus({ waitlisted_at: "x", cancelled_at: "y" })).toBe("cancelled");
  });
  it("orders the queue by when people joined it", () => {
    const rows = [
      { id: "a", created_at: "2026-10-26T08:00:00Z", ...seated },
      { id: "b", created_at: "2026-10-26T09:00:00Z", ...waiting("2026-10-26T09:00:00Z") },
      { id: "c", created_at: "2026-10-26T09:30:00Z", ...waiting("2026-10-26T09:30:00Z") },
      { id: "d", created_at: "2026-10-26T09:45:00Z", ...gone },
    ];
    expect(waitlistPosition(rows, "b")).toBe(1);
    expect(waitlistPosition(rows, "c")).toBe(2);
    expect(waitlistPosition(rows, "a")).toBeNull();
    expect(waitlistPosition(rows, "zz")).toBeNull();
  });
});

describe("stepKindsFor", () => {
  it("sends the welcome on every plan and the reminders on the paid ones", () => {
    expect(stepKindsFor(seated, PLAN_LIMITS.free)).toEqual(["confirmation"]);
    expect(stepKindsFor(seated, PLAN_LIMITS.starter)).toEqual(["confirmation", "reminder"]);
  });
  it("sends only the waiting-list note while waiting and nothing after opting out", () => {
    expect(stepKindsFor(waiting("x"), PLAN_LIMITS.pro)).toEqual(["waitlist"]);
    expect(stepKindsFor(gone, PLAN_LIMITS.pro)).toEqual([]);
  });
});
