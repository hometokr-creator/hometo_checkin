import type {
  CheckinIssue,
  CheckinIssueTag,
  TriageLevel,
} from "@/domains/checkin";

export function getIssueTriageLevel(tag: CheckinIssueTag): TriageLevel {
  return tag === "urgent" ? "R1" : "R2";
}

export function getOverallTriageLevel(
  issues: readonly CheckinIssue[],
): TriageLevel | undefined {
  if (issues.some((issue) => issue.triageLevel === "R1")) return "R1";
  return issues.length > 0 ? "R2" : undefined;
}
