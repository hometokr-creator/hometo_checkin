import { describe, expect, it } from "vitest";

import type { CheckinIssue, CheckinIssueTag } from "@/domains/checkin";

import { getIssueTriageLevel, getOverallTriageLevel } from "./triage";

describe("check-in triage", () => {
  it.each<CheckinIssueTag>([
    "facility",
    "relationship",
    "settlement",
    "other",
  ])("classifies %s as R2", (tag) => {
    expect(getIssueTriageLevel(tag)).toBe("R2");
  });

  it("classifies urgent issues as R1", () => {
    expect(getIssueTriageLevel("urgent")).toBe("R1");
  });

  it("uses the most urgent issue for overall triage", () => {
    const issues: CheckinIssue[] = [
      { tag: "facility", triageLevel: "R2" },
      { tag: "urgent", triageLevel: "R1" },
    ];

    expect(getOverallTriageLevel([])).toBeUndefined();
    expect(getOverallTriageLevel(issues.slice(0, 1))).toBe("R2");
    expect(getOverallTriageLevel(issues)).toBe("R1");
  });
});
