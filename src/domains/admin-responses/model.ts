export const ADMIN_ROUNDS = {
  "onboarding-d7": "입주 1주차", "monthly-first": "첫 달", monthly: "월간", "monthly-renewal": "재계약 전",
} as const;
export type AdminRound = keyof typeof ADMIN_ROUNDS;
export const ADMIN_TAGS = { facility: "시설", relationship: "관계", settlement: "정산", urgent: "긴급", other: "기타" } as const;
export type AdminTag = keyof typeof ADMIN_TAGS;
export const ADMIN_TOPICS = { kitchen: "주방·공용공간", "daily-life": "생활 습관", cleaning: "청소", host: "집주인과의 관계", costs: "생활비", other: "기타" } as const;
export const ADMIN_OUTCOMES = { ok: "불만 없음", reported: "불만 있음", urgent: "긴급" } as const;
export interface AdminIssue { id: string; tag: AdminTag; detailLabel: string | null; freeText: string | null }
export interface AdminParticipant {
  guestId?: string | null;
  id: string; name: string; phone: string; property: string | null; host: string | null;
  contractStart: string; contractEnd: string;
}
export interface AdminResponse {
  id: string; sessionId: string; participant: AdminParticipant; round: AdminRound;
  outcome: keyof typeof ADMIN_OUTCOMES; submittedAt: string; reviewedAt: string | null;
  issues: AdminIssue[]; initiallyPositive: boolean; labelsAvailable: boolean;
  interest: { exposed: boolean; clicked: boolean; topicsSubmitted: boolean; topics: string[] } | null;
  timeline: { at: string; question: string; answer: string }[];
  durationSeconds: number | null;
}
export interface AdminUrgentPending {
  sessionId: string; name: string; property: string | null; round: AdminRound;
  reachedAt: string; expiresAt: string;
}
export interface AdminInboxData { responses: AdminResponse[]; urgentPending: AdminUrgentPending[]; now: string }
export type ReviewResult = { ok: true } | { ok: false; message: string };
export type ReviewAction = (id: string, reviewed: boolean) => Promise<ReviewResult>;
export interface ResponseFilters {
  round: AdminRound | "all"; complaint: "all" | "yes" | "no";
  review: "all" | "unreviewed" | "reviewed"; from: string; to: string;
}
const DAY = 86400000;
export const koreanDate = (value: string) => new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 10);
export function initialFilters(now: string): ResponseFilters {
  return { round: "all", complaint: "all", review: "all", from: koreanDate(new Date(Date.parse(now) - 29 * DAY).toISOString()), to: koreanDate(now) };
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export const isUrgentResponse = (response: AdminResponse) => response.issues.some((issue) => issue.tag === "urgent");
export function sortResponses(responses: AdminResponse[]) {
  const rank = (response: AdminResponse) => isUrgentResponse(response) ? 0 : response.outcome !== "ok" ? 1 : 2;
  return [...responses].sort((a, b) => rank(a) - rank(b) || Date.parse(b.submittedAt) - Date.parse(a.submittedAt) || a.id.localeCompare(b.id));
}
export function filterResponses(responses: AdminResponse[], filters: ResponseFilters) {
  if ((filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) return [];
  return sortResponses(responses.filter((response) => {
    const day = koreanDate(response.submittedAt);
    return (filters.round === "all" || response.round === filters.round)
      && (filters.complaint === "all" || (response.outcome !== "ok") === (filters.complaint === "yes"))
      && (filters.review === "all" || !!response.reviewedAt === (filters.review === "reviewed"))
      && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  }));
}
export function responseSummary(responses: AdminResponse[]) {
  return { total: responses.length, reported: responses.filter((r) => r.outcome !== "ok").length, urgent: responses.filter(isUrgentResponse).length };
}
export function previousResponses(responses: AdminResponse[], selected: AdminResponse) {
  return responses.filter((r) => (r.participant.guestId && selected.participant.guestId
    ? r.participant.guestId === selected.participant.guestId : r.participant.id === selected.participant.id) && r.id !== selected.id && Date.parse(r.submittedAt) < Date.parse(selected.submittedAt))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt) || a.id.localeCompare(b.id));
}
export function formatAdminTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
export function formatElapsed(seconds: number) {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600), minutes = Math.floor(rounded % 3600 / 60), rest = rounded % 60;
  return [hours ? `${hours}시간` : "", minutes ? `${minutes}분` : "", `${rest}초`].filter(Boolean).join(" ");
}
