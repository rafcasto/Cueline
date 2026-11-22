import { describe, expect, it } from "vitest";
import { isExistingUser, safeNext, validateSignup } from "./signup";

describe("validateSignup", () => {
  it("accepts a name, an email and a password, normalised", () => {
    const r = validateSignup({ organisation: "  Tuesday   Sessions ", email: " Ana@Example.COM ", password: "longenough" });
    expect(r).toEqual({ ok: true, value: { organisation: "Tuesday Sessions", email: "ana@example.com", password: "longenough" } });
  });
  it("names the first thing to fix", () => {
    expect(validateSignup({ organisation: "", email: "a@b.co", password: "longenough" })).toMatchObject({ ok: false, error: expect.stringContaining("organisation") });
    expect(validateSignup({ organisation: "x".repeat(81), email: "a@b.co", password: "longenough" })).toMatchObject({ ok: false, error: expect.stringContaining("80") });
    expect(validateSignup({ organisation: "Me", email: "not-an-email", password: "longenough" })).toMatchObject({ ok: false, error: expect.stringContaining("email") });
    expect(validateSignup({ organisation: "Me", email: "a@b.co", password: "short" })).toMatchObject({ ok: false, error: expect.stringContaining("8") });
  });
  it("treats non-strings as missing", () => {
    expect(validateSignup({ organisation: 1, email: null, password: undefined })).toMatchObject({ ok: false });
  });
});

describe("isExistingUser", () => {
  it("is the identity-less user Supabase returns for a taken address", () => {
    expect(isExistingUser({ identities: [] })).toBe(true);
    expect(isExistingUser({ identities: [{ id: "x" }] })).toBe(false);
    expect(isExistingUser(null)).toBe(false);
    expect(isExistingUser({})).toBe(false);
  });
});

describe("safeNext", () => {
  it("allows same-origin paths only", () => {
    expect(safeNext("/host/billing")).toBe("/host/billing");
    expect(safeNext("//evil.example")).toBe("/host");
    expect(safeNext("https://evil.example")).toBe("/host");
    expect(safeNext(undefined)).toBe("/host");
  });
});
