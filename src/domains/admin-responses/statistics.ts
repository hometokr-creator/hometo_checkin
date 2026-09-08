import { ADMIN_ROUNDS, ADMIN_TAGS, ADMIN_TOPICS, initialFilters, koreanDate, validDate, type AdminRound, type AdminTag } from "./model";

export interface StatsSession {
  id: string; participantId: string; round: AdminRound; status: string; expiresAt: string;
  deliveries: { kind: string; status: string; sentAt: string | null }[];
  progress: { key: string; label: string; at: string; stage: "entry" | "tags" | "chips" | "text" | "options" | "unknown"; urgent: boolean }[];
  response: { at: string; outcome: string; positive: boolean | null; textAnswered: boolean; textProvided: boolean;
    issues: { tag: AdminTag; detail: string | null; hasText: boolean }[] } | null;
  interest: { exposedAt: string | null; clickedAt: string | null; submittedAt: string | null; topics: string[] } | null;
}
export interface StatsFilters { from: string; to: string; round: AdminRound | "all" }
export interface Ratio { n: number; d: number }
export interface Distribution extends Ratio { label: string }
export const METRIC_LABELS = {
  participation: "설문 참여율", entry: "진입 기록률", completion: "기록상 완주율", incomplete: "기록상 미완료율",
  reported: "실질 신고율", urgent: "긴급 접수율", description: "불만 설명 확보율", writing: "완료자 자유어 작성률",
  interestPerCompleted: "완료자 중 커뮤니티 관심", interestPerExposed: "노출자 중 커뮤니티 관심", soft: "초기 긍정 후 불만 발견률", reminder: "리마인더 발송 후 응답률",
} as const;
export type MetricKey = keyof typeof METRIC_LABELS;
export interface StatsSummary {
  sent: number; visited: number; completed: number; issues: number;
  metrics: Record<MetricKey, Ratio>;
  tags: Distribution[]; chips: Distribution[]; topics: Distribution[]; lastSteps: Distribution[]; stages: Distribution[];
  duration: { median: number | null; p25: number | null; p75: number | null; count: number; resumed: number; missing: number };
  pending: number; expired: number; urgentPending: number; repeated: number; completedWithoutProgress: number; unsupported: number;
}
export interface StatsPageData {
  filters: StatsFilters; now: string; summary: StatsSummary; rounds: { round: AdminRound; summary: StatsSummary }[];
  withoutDeliveryResponses: number; missingDeliveryTimes: number;
}
export function parseStatsFilters(params: Record<string, string | string[] | undefined>, now: string): StatsFilters | null {
  const defaults = initialFilters(now);
  const from = params.from ?? defaults.from, to = params.to ?? defaults.to, round = params.round ?? "all";
  if (typeof from !== "string" || typeof to !== "string" || typeof round !== "string" || !validDate(from) || !validDate(to) || from > to || (round !== "all" && !Object.hasOwn(ADMIN_ROUNDS, round))) return null;
  return { from, to, round: round as StatsFilters["round"] };
}
export function formatRatio({ n, d }: Ratio) {
  if (!d || n < 0 || n > d) return "계산 불가";
  return d < 10 ? `${n}/${d}` : `${Math.round(n / d * 100)}% (${n}/${d})`;
}
export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * p;
  const low = Math.floor(at), high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}
function firstSent(session: StatsSession, kind: string) {
  return session.deliveries.filter((d) => d.kind === kind && d.status === "sent" && d.sentAt && Number.isFinite(Date.parse(d.sentAt)))
    .map((d) => d.sentAt!).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}
function inPeriod(at: string, filters: StatsFilters) { const day = koreanDate(at); return day >= filters.from && day <= filters.to; }
function distribution(values: string[], denominator = values.length): Distribution[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([label, n]) => ({ label, n, d: denominator })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko"));
}
function summarize(all: StatsSession[], filters: StatsFilters, now: string): StatsSummary {
  const cohort = all.filter((s) => {
    const initial = firstSent(s, "initial");
    return initial && inPeriod(initial, filters) && (filters.round === "all" || s.round === filters.round);
  });
  const visited = cohort.filter((s) => s.progress.length), completed = cohort.filter((s) => s.response);
  const incomplete = visited.filter((s) => !s.response);
  const issues = completed.flatMap((s) => s.response!.issues);
  const positive = completed.filter((s) => s.response!.positive === true);
  const textAnswered = completed.filter((s) => s.response!.textAnswered);
  const exposed = completed.filter((s) => s.interest?.exposedAt);
  const clicked = completed.filter((s) => s.interest?.clickedAt);
  const topicSubmitted = completed.filter((s) => s.interest?.submittedAt);
  const reminder = cohort.filter((s) => firstSent(s, "reminder"));
  const ratio = (n: number, d: number): Ratio => ({ n, d });
  const metrics: StatsSummary["metrics"] = {
    participation: ratio(completed.length, cohort.length), entry: ratio(visited.length, cohort.length),
    completion: ratio(visited.filter((s) => s.response).length, visited.length), incomplete: ratio(incomplete.length, visited.length),
    reported: ratio(completed.filter((s) => s.response!.outcome !== "ok").length, completed.length),
    urgent: ratio(completed.filter((s) => s.response!.issues.some((i) => i.tag === "urgent")).length, completed.length),
    description: ratio(issues.filter((i) => i.hasText).length, issues.length), writing: ratio(textAnswered.filter((s) => s.response!.textProvided).length, textAnswered.length),
    interestPerCompleted: ratio(clicked.length, completed.length), interestPerExposed: ratio(exposed.filter((s) => s.interest?.clickedAt).length, exposed.length),
    soft: ratio(positive.filter((s) => s.response!.outcome !== "ok").length, positive.length),
    reminder: ratio(reminder.filter((s) => s.response && Date.parse(s.response.at) > Date.parse(firstSent(s, "reminder")!)).length, reminder.length),
  };
  const durations: number[] = []; let resumed = 0, missing = 0;
  for (const session of completed) {
    const first = Math.min(...session.progress.map((p) => Date.parse(p.at)));
    const duration = (Date.parse(session.response!.at) - first) / 1000;
    if (!Number.isFinite(duration) || duration < 0) missing++;
    else if (duration > 1800) resumed++;
    else durations.push(duration);
  }
  const tagCounts = new Map<AdminTag, number>();
  for (const issue of issues) tagCounts.set(issue.tag, (tagCounts.get(issue.tag) ?? 0) + 1);
  const chips = [...tagCounts].flatMap(([tag, total]) => distribution(issues.filter((i) => i.tag === tag).map((i) => `${ADMIN_TAGS[tag]} · ${i.detail ?? "세부 선택 없음"}`), total));
  const currentIds = new Set(completed.map((s) => s.id)), seen = new Set<string>(); let repeated = 0;
  const chronological = all.filter((s) => s.response).sort((a, b) => Date.parse(a.response!.at) - Date.parse(b.response!.at) || a.id.localeCompare(b.id));
  for (const session of chronological) for (const tag of new Set(session.response!.issues.map((i) => i.tag))) {
    const key = `${session.participantId}:${tag}`;
    if (seen.has(key) && currentIds.has(session.id)) repeated++;
    seen.add(key);
  }
  const lastSteps = distribution(incomplete.map((s) => {
    const lastAt = Math.max(...s.progress.map((p) => Date.parse(p.at)));
    const latest = s.progress.filter((p) => Date.parse(p.at) === lastAt);
    return `${ADMIN_ROUNDS[s.round]} · ${new Set(latest.map((p) => p.key)).size > 1 ? "동일 시각 여러 기록 · 단계 특정 불가" : latest[0].label}`;
  }));
  const stageLabels = { entry: "첫 질문", tags: "태그 선택", chips: "세부 항목 선택", text: "자유어 화면", options: "후속 선택 질문" } as const;
  const stages: Distribution[] = [ { label: "최초 발송", n: cohort.length, d: cohort.length },
    { label: "진입 기록", n: visited.length, d: cohort.length },
    ...Object.entries(stageLabels).map(([stage, label]) => ({ label, n: cohort.filter((s) => s.progress.some((p) => p.stage === stage)).length, d: cohort.length })),
    { label: "최종 제출", n: completed.length, d: cohort.length } ];
  return { sent: cohort.length, visited: visited.length, completed: completed.length, issues: issues.length, metrics,
    tags: Object.entries(ADMIN_TAGS).map(([tag, label]) => ({ label, n: tagCounts.get(tag as AdminTag) ?? 0, d: issues.length })), chips,
    topics: Object.entries(ADMIN_TOPICS).map(([topic, label]) => ({ label, n: topicSubmitted.filter((s) => s.interest!.topics.includes(topic)).length, d: topicSubmitted.length })),
    stages, lastSteps, duration: { median: quantile(durations, .5), p25: quantile(durations, .25), p75: quantile(durations, .75), count: durations.length, resumed, missing },
    pending: cohort.filter((s) => !s.response && Date.parse(s.expiresAt) > Date.parse(now)).length,
    expired: cohort.filter((s) => !s.response && Date.parse(s.expiresAt) <= Date.parse(now)).length,
    urgentPending: cohort.filter((s) => !s.response && s.progress.some((p) => p.urgent)).length,
    repeated, completedWithoutProgress: completed.filter((s) => !s.progress.length).length,
    unsupported: completed.filter((s) => s.response!.positive === null).length,
  };
}
export function buildStatsData(input: StatsSession[], filters: StatsFilters, now: string): StatsPageData {
  const observed = (at: string | null) => !!at && Number.isFinite(Date.parse(at)) && Date.parse(at) <= Date.parse(now);
  const all = input.filter((s) => s.status !== "cancelled" && Object.hasOwn(ADMIN_ROUNDS, s.round)).map((s) => ({ ...s,
    progress: s.progress.filter((p) => observed(p.at)), deliveries: s.deliveries.filter((d) => !d.sentAt || observed(d.sentAt)),
    response: s.response && observed(s.response.at) ? s.response : null,
    interest: s.interest ? { ...s.interest, exposedAt: observed(s.interest.exposedAt) ? s.interest.exposedAt : null,
      clickedAt: observed(s.interest.clickedAt) ? s.interest.clickedAt : null, submittedAt: observed(s.interest.submittedAt) ? s.interest.submittedAt : null } : null,
  }));
  const selectedRound = all.filter((s) => filters.round === "all" || s.round === filters.round);
  return { filters, now, summary: summarize(all, filters, now),
    rounds: Object.keys(ADMIN_ROUNDS).map((round) => ({ round: round as AdminRound, summary: summarize(all, { ...filters, round: round as AdminRound }, now) })),
    withoutDeliveryResponses: selectedRound.filter((s) => s.response && inPeriod(s.response.at, filters) && !firstSent(s, "initial")).length,
    missingDeliveryTimes: selectedRound.filter((s) => s.deliveries.some((d) => d.kind === "initial" && d.status === "sent" && !d.sentAt)).length,
  };
}
