import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, PRICE_LOOKUPS, isPriceLookup, planFromPrice, planLimits } from "./plans";

describe("plans", () => {
  it("matches the business model", () => {
    expect(PLAN_LIMITS.free).toMatchObject({ sessionsPerMonth: 1, participants: 10, minutes: 20, recording: false });
    expect(PLAN_LIMITS.starter).toMatchObject({ sessionsPerMonth: 4, participants: 50, minutes: 120, recording: true });
    expect(PLAN_LIMITS.pro).toMatchObject({ sessionsPerMonth: null, participants: 150, minutes: 240, hlsFallback: true, stripeCta: true });
  });
  it("includes one room on every plan and reminders only on the paid ones", () => {
    for (const plan of Object.values(PLAN_LIMITS)) expect(plan.roomsIncluded).toBe(1);
    expect(PLAN_LIMITS.free.reminders).toBe(false);
    expect(PLAN_LIMITS.starter.reminders).toBe(true);
    expect(PLAN_LIMITS.pro.reminders).toBe(true);
  });
  it("maps every Stripe lookup key to what it grants", () => {
    expect(Object.keys(PRICE_LOOKUPS).sort()).toEqual(["pro_monthly", "pro_yearly", "starter_monthly", "starter_yearly"]);
    expect(isPriceLookup("pro_monthly")).toBe(true);
    expect(isPriceLookup("enterprise")).toBe(false);
  });
  it("reads the plan from the lookup key first, then the product metadata", () => {
    expect(planFromPrice("starter_yearly", "pro")).toBe("starter");
    expect(planFromPrice("price_custom", "pro")).toBe("pro");
    expect(planFromPrice(null, "gold")).toBeNull();
  });
  it("treats an unknown plan as free", () => {
    expect(planLimits("gold")).toBe(PLAN_LIMITS.free);
    expect(planLimits(null)).toBe(PLAN_LIMITS.free);
  });
});
