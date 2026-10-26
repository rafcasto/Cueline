import { describe, expect, it } from "vitest";
import { eventStatus, formatEventTime, isEventFull, parseTopics, upcomingSince } from "./explore";
import { TOPIC_PATTERN, TOPIC_SUGGESTIONS } from "./topics";

describe("parseTopics", () => {
  it("lowercases, trims, dedupes and keeps order", () => {
    expect(parseTopics("Design, Product  Management ,design, ")).toEqual({ topics: ["design", "product management"] });
    expect(parseTopics(["Startups", "AI"])).toEqual({ topics: ["startups", "ai"] });
  });
  it("offers suggestions that are themselves valid topics", () => {
    for (const t of TOPIC_SUGGESTIONS) expect(t).toMatch(TOPIC_PATTERN);
    expect(new Set(TOPIC_SUGGESTIONS).size).toBe(TOPIC_SUGGESTIONS.length);
  });
  it("rejects bad topics and too many", () => {
    expect(parseTopics("a")).toEqual({ error: expect.stringContaining("not a valid topic") });
    expect(parseTopics("c++")).toEqual({ error: expect.stringContaining("not a valid topic") });
    expect(parseTopics("a1,a2,a3,a4,a5,a6,a7")).toEqual({ error: "Up to 6 topics." });
    expect(parseTopics([1])).toEqual({ error: "Topics must be text." });
  });
});

describe("formatEventTime", () => {
  it("renders in the host's zone and falls back to UTC for an unknown one", () => {
    expect(formatEventTime("2026-11-03T20:00:00Z", "Pacific/Auckland")).toEqual({ day: "Wed 4 Nov", time: expect.stringMatching(/^09:00/) });
    expect(formatEventTime("2026-11-03T20:00:00Z", "Mars/Olympus").day).toBe("Tue 3 Nov");
  });
});

describe("eventStatus", () => {
  const now = new Date("2026-11-03T20:00:00Z");
  it("is live while the room's session is live, whatever the clock says", () => {
    expect(eventStatus({ starts_at: "2026-11-03T18:00:00Z", session_state: "live" }, now)).toBe("live");
  });
  it("is soon within the hour, upcoming after, past two hours after the start", () => {
    expect(eventStatus({ starts_at: "2026-11-03T20:30:00Z", session_state: null }, now)).toBe("soon");
    expect(eventStatus({ starts_at: "2026-11-04T20:00:00Z", session_state: null }, now)).toBe("upcoming");
    expect(eventStatus({ starts_at: "2026-11-03T17:00:00Z", session_state: null }, now)).toBe("past");
  });
  it("keeps an event listed for two hours after its start", () => {
    expect(upcomingSince(now)).toBe("2026-11-03T18:00:00.000Z");
  });
});

describe("isEventFull", () => {
  it("is full only when the host set a cap and it is reached", () => {
    expect(isEventFull({ going: 10, capacity: 10 })).toBe(true);
    expect(isEventFull({ going: 9, capacity: 10 })).toBe(false);
    expect(isEventFull({ going: 500, capacity: null })).toBe(false);
  });
});
