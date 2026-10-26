import { describe, expect, it } from "vitest";
import { describeOffset, renderTemplate, sendTimeFor, templateVars, textToHtml } from "./template";

const vars = templateVars({
  name: "Ada Lovelace",
  title: "Launch webinar",
  room: "Main room",
  startsAt: "2026-11-01T18:00:00.000Z",
  timezone: "Europe/London",
  accessToken: "tok_123",
  code: "ABC234",
  appUrl: "https://tertulia.cloud/",
});

describe("templateVars", () => {
  it("builds links from the app url without a double slash", () => {
    expect(vars.link).toBe("https://tertulia.cloud/a/tok_123");
    expect(vars.join_url).toBe("https://tertulia.cloud/join");
    expect(vars.cancel_url).toBe("https://tertulia.cloud/a/tok_123/cancel");
  });
  it("formats the start in the event timezone", () => {
    expect(vars.starts_at).toContain("Sunday");
    expect(vars.starts_at).toContain("November 1");
    expect(vars.starts_at).toMatch(/6:00\s?PM/i);
  });
  it("falls back to a sentence when there is no start time", () => {
    expect(templateVars({ name: "A", title: "T", room: "R", startsAt: null, timezone: "UTC", accessToken: "x", code: "Y", appUrl: "http://l" }).starts_at).toBe("time to be announced");
  });
  it("derives first_name", () => {
    expect(vars.first_name).toBe("Ada");
  });
});

describe("renderTemplate", () => {
  it("replaces known placeholders and leaves unknown ones", () => {
    expect(renderTemplate("Hi {{name}}, code {{ code }} {{nope}}", vars)).toBe("Hi Ada Lovelace, code ABC234 {{nope}}");
  });
});

describe("textToHtml", () => {
  it("escapes html, links urls and adds a button", () => {
    const html = textToHtml("Hello <b>\n\nGo: https://x.io/a/1", { buttonUrl: "https://x.io/a/1", buttonLabel: "Join" });
    expect(html).toContain("Hello &lt;b&gt;");
    expect(html).toContain('<a href="https://x.io/a/1"');
    expect(html).toContain(">Join</a>");
    expect(html.match(/<p /g)?.length).toBe(3);
  });
});

describe("sendTimeFor", () => {
  const start = "2026-11-01T18:00:00.000Z";
  it("subtracts the offset from the start", () => {
    expect(sendTimeFor({ kind: "reminder", minutes_before: 1440 }, start)?.toISOString()).toBe("2026-10-31T18:00:00.000Z");
  });
  it("is now for the confirmation and the waiting-list note", () => {
    expect(sendTimeFor({ kind: "confirmation", minutes_before: null }, null, 1000)?.getTime()).toBe(1000);
    expect(sendTimeFor({ kind: "waitlist", minutes_before: null }, null, 1000)?.getTime()).toBe(1000);
  });
  it("is null for a reminder without a start time", () => {
    expect(sendTimeFor({ kind: "reminder", minutes_before: 15 }, null)).toBeNull();
  });
});

describe("describeOffset", () => {
  it("reads naturally", () => {
    expect(describeOffset(null)).toBe("On registration");
    expect(describeOffset(null, "waitlist")).toBe("On joining the waiting list");
    expect(describeOffset(2880)).toBe("2 days before");
    expect(describeOffset(1440)).toBe("1 day before");
    expect(describeOffset(120)).toBe("2 hours before");
    expect(describeOffset(15)).toBe("15 minutes before");
    expect(describeOffset(90)).toBe("90 minutes before");
  });
});
