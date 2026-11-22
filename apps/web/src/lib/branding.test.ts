import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, DEFAULT_COVERS, brandVars, contrastText, coverUrl, defaultCoverFor, isBranded, isDefaultCover, normalizeBranding, normalizeCoverUrl, normalizeHex, normalizeUrl, parseBranding, showsRoomName } from "./branding";

describe("normalizeHex", () => {
  it("accepts short, long and bare forms and lowercases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#4F46E5")).toBe("#4f46e5");
    expect(normalizeHex("4f46e5")).toBe("#4f46e5");
    expect(normalizeHex(" #4f46e5 ")).toBe("#4f46e5");
  });
  it("rejects anything else", () => {
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#4f46e")).toBeNull();
    expect(normalizeHex("#4f46e5ff")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("keeps http(s) and drops other schemes", () => {
    expect(normalizeUrl("https://tertulia.cloud/pricing")).toBe("https://tertulia.cloud/pricing");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("mailto:a@b.c")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("parseBranding", () => {
  it("returns an empty object for the migration default", () => {
    expect(parseBranding({})).toEqual({ branding: {} });
    expect(parseBranding(null)).toEqual({ branding: {} });
  });
  it("drops the accent when it is the product default", () => {
    expect(parseBranding({ accent: DEFAULT_ACCENT })).toEqual({ branding: {} });
    expect(parseBranding({ accent: "#0EA5E9" })).toEqual({ branding: { accent: "#0ea5e9" } });
  });
  it("treats empty strings as unset", () => {
    expect(parseBranding({ accent: "", logo_url: "" })).toEqual({ branding: {} });
  });
  it("names the field that is wrong", () => {
    expect(parseBranding({ accent: "blue" })).toEqual({ error: expect.stringContaining("accent colour") });
    expect(parseBranding({ logo_url: "ftp://x" })).toEqual({ error: expect.stringContaining("logo") });
    expect(parseBranding({ cover_url: "javascript:x" })).toEqual({ error: expect.stringContaining("cover picture") });
  });
  it("keeps an uploaded cover picture", () => {
    expect(parseBranding({ cover_url: "https://cdn/cover.jpg" })).toEqual({ branding: { cover_url: "https://cdn/cover.jpg" } });
    expect(parseBranding({ cover_url: "" })).toEqual({ branding: {} });
  });
  it("keeps a default cover by its site path and rejects any other path", () => {
    expect(parseBranding({ cover_url: DEFAULT_COVERS[0].url })).toEqual({ branding: { cover_url: DEFAULT_COVERS[0].url } });
    expect(parseBranding({ cover_url: "/covers/other.webp" })).toEqual({ error: expect.stringContaining("cover picture") });
    expect(parseBranding({ cover_url: "/etc/passwd" })).toEqual({ error: expect.stringContaining("cover picture") });
  });
  it("ignores the call to action older rows carry", () => {
    expect(parseBranding({ cta: { label: "Go", url: "https://x.io" }, ctas: [{ label: "Go", url: "https://x.io" }] })).toEqual({ branding: {} });
  });
  it("keeps hide_name only alongside a logo", () => {
    expect(parseBranding({ logo_url: "https://cdn/x.png", hide_name: true })).toEqual({ branding: { logo_url: "https://cdn/x.png", hide_name: true } });
    expect(parseBranding({ logo_url: "https://cdn/x.png", hide_name: "yes" })).toEqual({ branding: { logo_url: "https://cdn/x.png" } });
    expect(parseBranding({ hide_name: true })).toEqual({ branding: {} });
  });
});

describe("normalizeBranding", () => {
  it("salvages the valid parts of a bad row", () => {
    expect(normalizeBranding({ accent: "blue", cover_url: DEFAULT_COVERS[1].url, logo_url: "javascript:x" })).toEqual({ cover_url: DEFAULT_COVERS[1].url });
  });
  it("tolerates garbage", () => {
    expect(normalizeBranding("x")).toEqual({});
    expect(normalizeBranding(undefined)).toEqual({});
  });
});

describe("showsRoomName", () => {
  it("hides the name only when a logo stands in for it", () => {
    expect(showsRoomName({})).toBe(true);
    expect(showsRoomName({ logo_url: "https://cdn/x.png" })).toBe(true);
    expect(showsRoomName({ logo_url: "https://cdn/x.png", hide_name: true })).toBe(false);
    expect(showsRoomName({ hide_name: true })).toBe(true);
    expect(showsRoomName({ logo_url: "nope", hide_name: true })).toBe(true);
  });
});

describe("contrastText", () => {
  it("puts white on dark accents and dark ink on light ones", () => {
    expect(contrastText("#17706f")).toBe("#ffffff");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#facc15")).toBe("#2b1d19");
    expect(contrastText("#ffffff")).toBe("#2b1d19");
  });
});

describe("brandVars", () => {
  it("is undefined without an accent, so the default theme stays untouched", () => {
    expect(brandVars({})).toBeUndefined();
    expect(brandVars({ logo_url: "https://cdn/x.png" })).toBeUndefined();
  });
  it("derives every brand token from the one colour", () => {
    const v = brandVars({ accent: "#facc15" })!;
    expect(v["--brand"]).toBe("#facc15");
    expect(v["--brand-contrast"]).toBe("#2b1d19");
    expect(v["--focus"]).toBe("#facc15");
    expect(v["--brand-hover"]).toContain("#facc15");
    expect(v["--brand-soft"]).toContain("transparent");
    expect(v["--brand-ink"]).toContain("var(--ink)");
  });
});

describe("isBranded", () => {
  it("is false for the default and true once anything is set", () => {
    expect(isBranded({})).toBe(false);
    expect(isBranded({ cover_url: DEFAULT_COVERS[0].url })).toBe(false);
    expect(isBranded({ cover_url: "https://cdn/cover.jpg" })).toBe(true);
    expect(isBranded({ accent: "#0ea5e9" })).toBe(true);
  });
});

describe("default covers", () => {
  it("are four distinct site paths", () => {
    expect(DEFAULT_COVERS).toHaveLength(4);
    expect(new Set(DEFAULT_COVERS.map((c) => c.url)).size).toBe(4);
    for (const c of DEFAULT_COVERS) expect(isDefaultCover(c.url)).toBe(true);
    expect(isDefaultCover("/covers/nope.webp")).toBe(false);
  });
  it("normalizeCoverUrl takes a default or an http(s) link", () => {
    expect(normalizeCoverUrl(` ${DEFAULT_COVERS[2].url} `)).toBe(DEFAULT_COVERS[2].url);
    expect(normalizeCoverUrl("https://cdn/c.jpg")).toBe("https://cdn/c.jpg");
    expect(normalizeCoverUrl("javascript:x")).toBeNull();
  });
  it("defaultCoverFor is stable for a room and spreads across the set", () => {
    expect(defaultCoverFor("Tuesday product sessions")).toBe(defaultCoverFor("Tuesday product sessions"));
    expect(isDefaultCover(defaultCoverFor(""))).toBe(true);
    const picks = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(defaultCoverFor));
    expect(picks.size).toBeGreaterThan(1);
  });
  it("coverUrl never comes back empty", () => {
    expect(coverUrl({}, "Book club")).toBe(defaultCoverFor("Book club"));
    expect(coverUrl({ cover_url: "https://cdn/c.jpg" }, "Book club")).toBe("https://cdn/c.jpg");
  });
});
