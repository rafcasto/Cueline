import { describe, expect, it } from "vitest";
import { viewerIdentityMessage } from "./identity";

describe("viewerIdentityMessage", () => {
  it("names the project setting when anonymous sign-ins are off", () => {
    expect(viewerIdentityMessage({ name: "AuthApiError", status: 422, code: "anonymous_provider_disabled", message: "Anonymous sign-ins are disabled" })).toContain("Allow anonymous sign-ins");
    expect(viewerIdentityMessage(new Error("Anonymous sign-ins are disabled"))).toContain("Allow anonymous sign-ins");
  });
  it("explains the rate limit on a 429", () => {
    expect(viewerIdentityMessage({ status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" })).toContain("rate limit");
  });
  it("points at captcha and sign-up settings", () => {
    expect(viewerIdentityMessage({ code: "captcha_failed", message: "captcha verification process failed" })).toContain("Attack Protection");
    expect(viewerIdentityMessage({ code: "signup_disabled", message: "Signups not allowed" })).toContain("Sign-ups are disabled");
  });
  it("catches a missing public env before it looks like a browser problem", () => {
    expect(viewerIdentityMessage(new Error("supabaseUrl is required."))).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("treats fetch failures as connectivity", () => {
    expect(viewerIdentityMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toContain("Could not reach");
    expect(viewerIdentityMessage(new TypeError("Load failed"))).toContain("Could not reach");
  });
  it("keeps the raw message in the fallback and only then mentions cookies", () => {
    const m = viewerIdentityMessage(new Error("something odd"));
    expect(m).toContain("something odd");
    expect(m).toContain("cookies");
    expect(viewerIdentityMessage(undefined)).toBe("Could not start a session in this browser. If this keeps happening, cookies may be blocked for this site.");
  });
});
