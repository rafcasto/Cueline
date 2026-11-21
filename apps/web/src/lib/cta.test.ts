import { describe, expect, it } from "vitest";
import { ctaButtonText, ctaButtons, parseCtaButtons } from "./cta";

describe("ctaButtons", () => {
  it("reads a row from before groups as one unlabelled button", () => {
    expect(ctaButtons({ config: { destination: "stripe", target: "price_1" } })).toEqual([{ label: "", destination: "stripe", target: "price_1" }]);
    expect(ctaButtons({ config: {} })).toEqual([{ label: "", destination: "tab", target: "" }]);
  });
  it("prefers the group, capped at three, dropping garbage", () => {
    const b = (label: string) => ({ label, destination: "tab" as const, target: "https://x.io/" });
    expect(ctaButtons({ config: { destination: "tab", target: "https://old", buttons: [b("1"), "x" as never, b("2"), b("3"), b("4")] } })).toEqual([b("1"), b("2"), b("3")]);
    expect(ctaButtons({ config: { buttons: [{ label: " Go ", destination: "nope" as never, target: " https://x.io/ " }] } })[0]).toEqual({ label: "Go", destination: "tab", target: "https://x.io/" });
  });
});

describe("ctaButtonText", () => {
  it("falls back to the generic word", () => {
    expect(ctaButtonText({ label: "", destination: "tab", target: "" })).toBe("Open");
    expect(ctaButtonText({ label: "", destination: "stripe", target: "" })).toBe("Buy now");
    expect(ctaButtonText({ label: "Register", destination: "tab", target: "" })).toBe("Register");
  });
});

describe("parseCtaButtons", () => {
  const tab = { label: "Learn more", destination: "tab" as const, target: "https://x.io/learn" };
  it("keeps the first button at the top of the config as well", () => {
    expect(parseCtaButtons([{ label: "", destination: "stripe", target: "price_abc" }])).toEqual({ config: { destination: "stripe", target: "price_abc", buttons: [{ label: "", destination: "stripe", target: "price_abc" }] } });
  });
  it("allows one to three buttons", () => {
    expect(parseCtaButtons([])).toEqual({ error: expect.stringContaining("at least one") });
    expect(parseCtaButtons([tab, tab, tab, tab])).toEqual({ error: expect.stringContaining("up to 3") });
    expect(parseCtaButtons([tab, tab, tab])).toEqual({ config: expect.objectContaining({ buttons: [tab, tab, tab] }) });
  });
  it("needs a label on every button once there is more than one", () => {
    expect(parseCtaButtons([tab, { ...tab, label: "" }])).toEqual({ error: expect.stringContaining("second button needs a label") });
    expect(parseCtaButtons([{ ...tab, label: "" }])).toEqual({ config: expect.anything() });
  });
  it("checks the target against the destination and names the button", () => {
    expect(parseCtaButtons([tab, { label: "Buy", destination: "stripe", target: "https://x.io" }])).toEqual({ error: expect.stringContaining("second button needs a Stripe price id") });
    expect(parseCtaButtons([tab, tab, { label: "Buy", destination: "embed", target: "javascript:x" }])).toEqual({ error: expect.stringContaining("third button needs a web address") });
    expect(parseCtaButtons([{ label: "x".repeat(41), destination: "tab", target: "https://x.io" }])).toEqual({ error: expect.stringContaining("40 characters") });
  });
  it("trims and normalises", () => {
    expect(parseCtaButtons([{ label: " Go ", destination: "tab", target: " https://x.io " }])).toEqual({ config: { destination: "tab", target: "https://x.io/", buttons: [{ label: "Go", destination: "tab", target: "https://x.io/" }] } });
  });
});
