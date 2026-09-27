import { describe, expect, it } from "vitest";
import { extractPresentationId } from "@/components/HostPanel";

describe("extractPresentationId", () => {
  it("pulls the id from a Slides URL", () => {
    expect(extractPresentationId("https://docs.google.com/presentation/d/1AbC_dEf-123456/edit#slide=id.p")).toBe("1AbC_dEf-123456");
  });
  it("accepts a bare id and rejects junk", () => {
    expect(extractPresentationId("  1AbC_dEf-123456 ")).toBe("1AbC_dEf-123456");
    expect(extractPresentationId("hello world")).toBe("");
  });
});
