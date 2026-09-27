import { describe, expect, it } from "vitest";
import { hasCue, parseCueLine, parseNotes } from "./index";

describe("parseCueLine", () => {
  it("parses a single-choice poll", () => {
    const { cue, error } = parseCueLine(
      "#poll: Which channel brings you the most leads? | Email | LinkedIn | Referrals | Paid",
    );
    expect(error).toBeNull();
    expect(cue).toEqual({
      kind: "poll",
      question: "Which channel brings you the most leads?",
      options: ["Email", "LinkedIn", "Referrals", "Paid"],
    });
  });

  it("parses a multi-choice poll and open text", () => {
    expect(parseCueLine("#multipoll: Tools? | Slack | Notion").cue).toEqual({
      kind: "multipoll",
      question: "Tools?",
      options: ["Slack", "Notion"],
    });
    expect(parseCueLine("#text: Biggest blocker?").cue).toEqual({
      kind: "text",
      question: "Biggest blocker?",
    });
  });

  it("parses embed and stripe CTAs", () => {
    expect(parseCueLine("#cta: Join the waitlist | embed | https://cueline.app/waitlist").cue).toEqual({
      kind: "cta",
      label: "Join the waitlist",
      destination: "embed",
      target: "https://cueline.app/waitlist",
    });
    expect(parseCueLine("#cta: Buy the course | stripe | price_1Abc").cue).toEqual({
      kind: "cta",
      label: "Buy the course",
      destination: "stripe",
      target: "price_1Abc",
    });
  });

  it("is case-insensitive on the tag and tolerant of spacing", () => {
    expect(parseCueLine("  #POLL :  Q?  |  A  |  B  ").cue).toEqual({
      kind: "poll",
      question: "Q?",
      options: ["A", "B"],
    });
  });

  it("ignores non-cue lines", () => {
    expect(parseCueLine("Remember to breathe.")).toEqual({ cue: null, error: null });
    expect(parseCueLine("#hashtag not a cue")).toEqual({ cue: null, error: null });
  });

  it("reports malformed cues", () => {
    expect(parseCueLine("#poll: Only one option? | A").error).toMatch(/two options/);
    expect(parseCueLine("#cta: Buy | stripe | not-a-price").error).toMatch(/price_/);
    expect(parseCueLine("#cta: Go | tab | ftp://x").error).toMatch(/http/);
    expect(parseCueLine("#cta: Go | mars | https://x").error).toMatch(/unknown destination/);
  });
});

describe("parseNotes", () => {
  it("extracts one poll and one cta from multi-line notes", () => {
    const notes = [
      "Talk about the funnel here.",
      "#poll: Leads? | Email | LinkedIn",
      "",
      "#cta: Buy | stripe | price_123",
    ].join("\n");
    const parsed = parseNotes(notes);
    expect(parsed.poll?.kind).toBe("poll");
    expect(parsed.cta?.destination).toBe("stripe");
    expect(parsed.errors).toEqual([]);
  });

  it("keeps the first poll and flags duplicates", () => {
    const parsed = parseNotes("#poll: A? | 1 | 2\r\n#text: B?");
    expect(parsed.poll).toEqual({ kind: "poll", question: "A?", options: ["1", "2"] });
    expect(parsed.errors).toEqual(["#text: only one poll per slide"]);
  });

  it("handles empty notes", () => {
    expect(parseNotes(null)).toEqual({ poll: null, cta: null, errors: [] });
    expect(hasCue("")).toBe(false);
    expect(hasCue("x\n#cta: a | tab | https://b")).toBe(true);
  });
});
