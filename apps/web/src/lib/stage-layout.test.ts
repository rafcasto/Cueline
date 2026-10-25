import { describe, expect, it } from "vitest";
import { CORNER_BOX, VIDEO_MAX_W, VIDEO_MIN_W, clampVideoBox, describeLayout, normalizeStageLayout, nudgeVideoBox, parseStageLayout, sameLayout, stageBoxes, toCustom } from "./stage-layout";

describe("normalizeStageLayout", () => {
  it("falls back to the corner for the migration default, a missing row and an unknown mode", () => {
    expect(normalizeStageLayout({ mode: "default" })).toEqual({ mode: "default" });
    expect(normalizeStageLayout(undefined)).toEqual({ mode: "default" });
    expect(normalizeStageLayout(null)).toEqual({ mode: "default" });
    expect(normalizeStageLayout({ mode: "diagonal" })).toEqual({ mode: "default" });
  });
  it("keeps the presets without a box", () => {
    expect(normalizeStageLayout({ mode: "talking_head", video: { x: 1, y: 1, w: 50 } })).toEqual({ mode: "talking_head" });
    expect(normalizeStageLayout({ mode: "split" })).toEqual({ mode: "split" });
  });
  it("gives a custom layout a valid box even when the stored one is broken", () => {
    expect(normalizeStageLayout({ mode: "custom" })).toEqual({ mode: "custom", video: CORNER_BOX });
    expect(normalizeStageLayout({ mode: "custom", video: { x: 90, y: -4, w: 30 } })).toEqual({ mode: "custom", video: { x: 70, y: 0, w: 30 } });
    expect(normalizeStageLayout({ mode: "custom", video: { x: "a", y: NaN, w: Infinity } })).toEqual({ mode: "custom", video: CORNER_BOX });
  });
});

describe("clampVideoBox", () => {
  it("limits the width and keeps the box inside the stage", () => {
    expect(clampVideoBox({ x: 0, y: 0, w: 3 }).w).toBe(VIDEO_MIN_W);
    expect(clampVideoBox({ x: 0, y: 0, w: 140 })).toEqual({ x: 0, y: 0, w: VIDEO_MAX_W });
    expect(clampVideoBox({ x: 95, y: 95, w: 20 })).toEqual({ x: 80, y: 80, w: 20 });
  });
  it("rounds to half a percent so a drag does not store long decimals", () => {
    expect(clampVideoBox({ x: 10.26, y: 20.74, w: 30.1 })).toEqual({ x: 10.5, y: 20.5, w: 30 });
  });
});

describe("parseStageLayout", () => {
  it("accepts the presets and rejects the rest", () => {
    expect(parseStageLayout({ mode: "split" })).toEqual({ layout: { mode: "split" } });
    expect(parseStageLayout({ mode: "nope" })).toHaveProperty("error");
    expect(parseStageLayout("split")).toHaveProperty("error");
    expect(parseStageLayout(null)).toHaveProperty("error");
  });
  it("requires numbers for a custom box and clamps them", () => {
    expect(parseStageLayout({ mode: "custom" })).toHaveProperty("error");
    expect(parseStageLayout({ mode: "custom", video: { x: 1, y: 2 } })).toHaveProperty("error");
    expect(parseStageLayout({ mode: "custom", video: { x: 95, y: 5, w: 20 } })).toEqual({ layout: { mode: "custom", video: { x: 80, y: 5, w: 20 } } });
  });
});

describe("stageBoxes", () => {
  it("puts the corner thumbnail bottom-right with a two percent margin", () => {
    const { slide, video } = stageBoxes({ mode: "default" });
    expect(slide).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(video).toEqual({ x: 74, y: 74, w: 24, h: 24 });
    expect(video.x + video.w).toBe(98);
  });
  it("hides the deck for a talking head and splits the stage in halves side by side", () => {
    expect(stageBoxes({ mode: "talking_head" })).toEqual({ slide: null, video: { x: 0, y: 0, w: 100, h: 100 }, fit: "cover" });
    const split = stageBoxes({ mode: "split" });
    expect(split.slide).toEqual({ x: 0, y: 0, w: 50, h: 100 });
    expect(split.video).toEqual({ x: 50, y: 0, w: 50, h: 100 });
  });
  it("keeps a custom box 16:9, so its height in percent equals its width", () => {
    expect(stageBoxes({ mode: "custom", video: { x: 10, y: 20, w: 30 } }).video).toEqual({ x: 10, y: 20, w: 30, h: 30 });
  });
});

describe("toCustom", () => {
  it("starts a custom layout from where the camera already is", () => {
    expect(toCustom({ mode: "default" })).toEqual({ mode: "custom", video: CORNER_BOX });
    // A half is taller than 16:9; the custom box takes the smaller side so it still fits.
    expect(toCustom({ mode: "split" })).toEqual({ mode: "custom", video: { x: 50, y: 0, w: 50 } });
    expect(toCustom({ mode: "talking_head" })).toEqual({ mode: "custom", video: { x: 0, y: 0, w: 100 } });
  });
  it("leaves a custom layout alone", () => {
    const l = { mode: "custom" as const, video: { x: 5, y: 5, w: 40 } };
    expect(toCustom(l)).toBe(l);
  });
});

describe("nudgeVideoBox", () => {
  const l = { mode: "custom" as const, video: { x: 50, y: 50, w: 20 } };
  it("moves with the arrows and resizes with plus and minus", () => {
    expect(nudgeVideoBox(l, "ArrowLeft").video).toEqual({ x: 49, y: 50, w: 20 });
    expect(nudgeVideoBox(l, "ArrowDown", 5).video).toEqual({ x: 50, y: 55, w: 20 });
    expect(nudgeVideoBox(l, "+", 2).video).toEqual({ x: 50, y: 50, w: 22 });
    expect(nudgeVideoBox(l, "-").video).toEqual({ x: 50, y: 50, w: 19 });
  });
  it("stops at the edges and ignores other keys and other modes", () => {
    expect(nudgeVideoBox({ mode: "custom", video: { x: 80, y: 0, w: 20 } }, "ArrowRight").video).toEqual({ x: 80, y: 0, w: 20 });
    expect(nudgeVideoBox(l, "Enter")).toBe(l);
    expect(nudgeVideoBox({ mode: "split" }, "ArrowLeft")).toEqual({ mode: "split" });
  });
});

describe("describeLayout and sameLayout", () => {
  it("describes a custom position in numbers and a preset in words", () => {
    expect(describeLayout({ mode: "custom", video: { x: 10, y: 20, w: 30 } })).toBe("Your camera is 30% of the stage wide, 10% from the left and 20% from the top.");
    expect(describeLayout({ mode: "talking_head" })).toMatch(/fills the stage/);
  });
  it("compares by effect, not by stray fields", () => {
    expect(sameLayout({ mode: "split" }, { mode: "split", video: { x: 1, y: 1, w: 50 } })).toBe(true);
    expect(sameLayout({ mode: "custom", video: { x: 1, y: 1, w: 50 } }, { mode: "custom", video: { x: 1, y: 2, w: 50 } })).toBe(false);
    expect(sameLayout({ mode: "default" }, { mode: "custom", video: CORNER_BOX })).toBe(false);
  });
});
