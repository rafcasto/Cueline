import { describe, expect, it } from "vitest";
import { recordingLength, retention } from "./recordings";

describe("recordingLength", () => {
  it("is null until the session has both ends", () => {
    expect(recordingLength({ started_at: "2026-01-01T10:00:00Z", ended_at: null })).toBeNull();
  });
  it("rounds to whole minutes, at least one", () => {
    expect(recordingLength({ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T10:00:10Z" })).toBe("1 min");
    expect(recordingLength({ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T10:42:20Z" })).toBe("42 min");
  });
  it("pads minutes past the hour", () => {
    expect(recordingLength({ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T11:05:00Z" })).toBe("1 h 05 min");
  });
});

describe("retention", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  it("is kept with no expiry", () => {
    expect(retention(null, now).kind).toBe("kept");
  });
  it("is expired once the date has passed", () => {
    expect(retention("2026-06-01T11:00:00Z", now).kind).toBe("expired");
  });
  it("is soon within a week", () => {
    const r = retention("2026-06-05T12:00:00Z", now);
    expect(r.kind).toBe("soon");
    expect(r.label).toMatch(/^Kept until/);
  });
  it("is until beyond a week", () => {
    expect(retention("2027-06-01T12:00:00Z", now).kind).toBe("until");
  });
});
