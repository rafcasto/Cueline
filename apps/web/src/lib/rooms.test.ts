import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, roomAllowance, roomsLeft, slugify, uniqueSlug } from "./rooms";

describe("slugify", () => {
  it("lowercases, strips accents and joins words with hyphens", () => {
    expect(slugify("Product Launch Q4")).toBe("product-launch-q4");
    expect(slugify("  Café  Séance!! ")).toBe("cafe-seance");
  });
  it("pads very short names and falls back for empty ones", () => {
    expect(slugify("Go")).toBe("go-room");
    expect(slugify("!!!")).toBe("room");
  });
  it("always produces a slug the database accepts", () => {
    for (const name of ["x", "A very long room name that goes on and on and on and on and on", "---", "Ünïcödé", "9 lives"]) {
      expect(slugify(name)).toMatch(SLUG_PATTERN);
    }
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free and numbers it otherwise", () => {
    expect(uniqueSlug("main", [])).toBe("main");
    expect(uniqueSlug("main", ["main"])).toBe("main-2");
    expect(uniqueSlug("main", ["main", "main-2"])).toBe("main-3");
  });
  it("keeps the numbered slug within 40 characters", () => {
    const long = "a".repeat(40);
    const s = uniqueSlug(long, [long]);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s).toMatch(SLUG_PATTERN);
    expect(s.endsWith("-2")).toBe(true);
  });
});

describe("roomAllowance", () => {
  it("adds bought rooms to the plan's and never goes below the plan", () => {
    expect(roomAllowance({ roomsIncluded: 1 }, 0)).toBe(1);
    expect(roomAllowance({ roomsIncluded: 1 }, 2)).toBe(3);
    expect(roomAllowance({ roomsIncluded: 1 }, -5)).toBe(1);
  });
  it("is unlimited for a platform admin", () => {
    expect(roomAllowance({ roomsIncluded: 1 }, 0, true)).toBeNull();
    expect(roomsLeft(null, 40)).toBeNull();
  });
  it("counts what is left", () => {
    expect(roomsLeft(3, 1)).toBe(2);
    expect(roomsLeft(1, 1)).toBe(0);
    expect(roomsLeft(1, 4)).toBe(0);
  });
});
