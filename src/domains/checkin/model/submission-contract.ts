import type {
  CheckinAnswers,
  CheckinIssue,
  CheckinIssueTag,
  CheckinSubmission,
  TriageLevel,
} from "./checkin";

const ISSUE_TAGS = new Set<CheckinIssueTag>([
  "facility",
  "relationship",
  "settlement",
  "urgent",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTriageLevel(value: unknown): value is TriageLevel {
  return value === "R1" || value === "R2";
}

function isIssue(value: unknown): value is CheckinIssue {
  if (!isRecord(value) || !ISSUE_TAGS.has(value.tag as CheckinIssueTag)) return false;
  if (!isTriageLevel(value.triageLevel)) return false;
  if (value.detail !== undefined && typeof value.detail !== "string") return false;
  if (value.freeText !== undefined &&
      (typeof value.freeText !== "string" || value.freeText.length > 500)) return false;

  return value.tag === "urgent"
    ? value.triageLevel === "R1"
    : value.triageLevel === "R2";
}

function hasValidResponses(value: unknown): value is CheckinAnswers["responses"] {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (response) =>
      typeof response === "string" ||
      (typeof response === "number" && Number.isFinite(response)),
  );
}

function hasConsistentOverallTriage(
  issues: readonly CheckinIssue[],
  overallTriage: unknown,
) {
  if (issues.length === 0) return overallTriage === undefined;
  const expected = issues.some((issue) => issue.triageLevel === "R1") ? "R1" : "R2";
  return overallTriage === expected;
}

export function isCheckinSubmission(value: unknown): value is CheckinSubmission {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (typeof value.sessionId !== "string" || value.sessionId.trim() === "") return false;
  if (
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.trim() === ""
  ) {
    return false;
  }
  if (!isRecord(value.answers)) return false;

  const { responses, issues, freeText, overallTriage } = value.answers;
  if (!hasValidResponses(responses)) return false;
  if (!Array.isArray(issues) || issues.length > 2 || !issues.every(isIssue)) return false;
  if (freeText !== undefined && (typeof freeText !== "string" || freeText.length > 500)) {
    return false;
  }

  return hasConsistentOverallTriage(issues, overallTriage);
}

export function assertCheckinSubmission(
  value: unknown,
): asserts value is CheckinSubmission {
  if (!isCheckinSubmission(value)) {
    throw new TypeError("Invalid check-in submission payload");
  }
}
