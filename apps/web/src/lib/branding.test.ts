import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, brandVars, contrastText, isBranded, normalizeBranding, normalizeHex, normalizeUrl, parseBranding } from "./branding";

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
    expect(parseBranding({ accent: "", logo_url: "", cta: { label: "", url: "" } })).toEqual({ branding: {} });
  });
  it("names the field that is wrong", () => {
    expect(parseBranding({ accent: "blue" })).toEqual({ error: expect.stringContaining("accent colour") });
    expect(parseBranding({ logo_url: "ftp://x" })).toEqual({ error: expect.stringContaining("logo") });
    expect(parseBranding({ cta: { label: "", url: "https://x.io" } })).toEqual({ error: expect.stringContaining("label") });
    expect(parseBranding({ cta: { label: "Buy", url: "nope" } })).toEqual({ error: expect.stringContaining("web address") });
    expect(parseBranding({ cta: { label: "x".repeat(41), url: "https://x.io" } })).toEqual({ error: expect.stringContaining("40 characters") });
  });
  it("keeps a complete call to action, trimmed", () => {
    expect(parseBranding({ cta: { label: "  Book a demo ", url: " https://tertulia.cloud/demo " } })).toEqual({ branding: { cta: { label: "Book a demo", url: "https://tertulia.cloud/demo" } } });
  });
});

describe("normalizeBranding", () => {
  it("salvages the valid parts of a bad row", () => {
    expect(normalizeBranding({ accent: "nope", logo_url: "https://cdn/x.png", cta: { label: "Go", url: "bad" } })).toEqual({ logo_url: "https://cdn/x.png" });
  });
  it("tolerates garbage", () => {
    expect(normalizeBranding("x")).toEqual({});
    expect(normalizeBranding(undefined)).toEqual({});
  });
});

describe("contrastText", () => {
  it("puts white on dark accents and dark ink on light ones", () => {
    expect(contrastText("#4f46e5")).toBe("#ffffff");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#facc15")).toBe("#0f172a");
    expect(contrastText("#ffffff")).toBe("#0f172a");
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
    expect(v["--brand-contrast"]).toBe("#0f172a");
    expect(v["--focus"]).toBe("#facc15");
    expect(v["--brand-hover"]).toContain("#facc15");
    expect(v["--brand-soft"]).toContain("transparent");
    expect(v["--brand-ink"]).toContain("var(--ink)");
  });
});

describe("isBranded", () => {
  it("is false for the default and true once anything is set", () => {
    expect(isBranded({})).toBe(false);
    expect(isBranded({ cta: { label: "Go", url: "https://x.io" } })).toBe(true);
  });
});
