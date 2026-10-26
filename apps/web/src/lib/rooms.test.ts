import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify, uniqueSlug } from "./rooms";

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
