import type { StatsSession } from "../src/domains/admin-responses/statistics";

export function statsFixtures(sample = 3): StatsSession[] {
  const base: StatsSession = { id: "one", participantId: "one", round: "monthly", status: "completed", expiresAt: "2026-09-15T00:00:00Z", deliveries: [{ kind: "initial", status: "sent", sentAt: "2026-09-01T00:00:00Z" }],
    progress: [{ key: "main", label: "이번 달은 잘 지내셨어요?", at: "2026-09-02T00:00:00Z", stage: "entry", urgent: false }],
    response: { at: "2026-09-02T00:01:00Z", outcome: "reported", positive: true, textAnswered: true, textProvided: true, issues: [{ tag: "facility", detail: "난방·에어컨", hasText: true }, { tag: "settlement", detail: "공과금이 이상해요", hasText: false }] },
    interest: { exposedAt: "2026-09-02T00:02:00Z", clickedAt: "2026-09-02T00:03:00Z", submittedAt: "2026-09-02T00:04:00Z", topics: ["kitchen", "daily-life"] } };
  if (sample !== 3) return Array.from({ length: sample }, (_, i) => ({ ...base, id: `sample-${i}`, participantId: `person-${i}` }));
  return [base, { ...base, id: "two", participantId: "two", progress: [], interest: null, response: { ...base.response!, outcome: "ok", issues: [], textAnswered: true, textProvided: false } },
    { ...base, id: "three", participantId: "three", status: "open", expiresAt: "2026-09-07T00:00:00Z", response: null, interest: null,
      progress: [{ key: "urgent", label: "어떤 도움이 필요하신가요?", stage: "chips", urgent: true, at: "2026-09-02T00:00:00Z" }] }];
}
