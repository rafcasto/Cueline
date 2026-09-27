import { describe, expect, it } from "vitest";

// Pure helpers are re-declared here because content.ts runs top-level side effects.
const slideFromHref = (href: string) => /[?&#]slide=(id\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]+)/.exec(href)?.[1] ?? null;
const presentationId = (path: string) => /\/presentation\/d\/([A-Za-z0-9_-]+)/.exec(path)?.[1] ?? null;

describe("slide detection", () => {
  it("reads slide= from present-mode URLs", () => {
    expect(slideFromHref("https://docs.google.com/presentation/d/1Ab/present?slide=id.g2f3a1b")).toBe("id.g2f3a1b");
    expect(slideFromHref("https://docs.google.com/presentation/d/1Ab/edit#slide=id.p")).toBe("id.p");
    expect(slideFromHref("https://docs.google.com/presentation/d/1Ab/present")).toBeNull();
  });
  it("reads the presentation id from the path", () => {
    expect(presentationId("/presentation/d/1AbC_d-EF/present")).toBe("1AbC_d-EF");
    expect(presentationId("/document/d/x/edit")).toBeNull();
  });
});
