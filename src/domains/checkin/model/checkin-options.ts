import type { CheckinIssueTag } from "./checkin";

export interface CheckinTagOption {
  value: CheckinIssueTag;
  label: string;
  urgent?: boolean;
}

export interface CheckinDetailOption {
  value: string;
  label: string;
}

export const CHECKIN_TAG_OPTIONS = [
  { value: "facility", label: "🔧 시설·수리" },
  { value: "relationship", label: "🏠 집주인과의 관계" },
  { value: "settlement", label: "💰 정산·비용" },
  { value: "urgent", label: "⚠️ 안전·긴급", urgent: true },
  { value: "other", label: "그 외" },
] as const satisfies readonly CheckinTagOption[];

export const CHECKIN_DETAIL_OPTIONS = {
  facility: [
    { value: "leak", label: "누수·물샘" },
    { value: "climate", label: "난방·에어컨" },
    { value: "mold", label: "곰팡이·습기" },
    { value: "lock", label: "문·잠금" },
    { value: "pests", label: "벌레·해충" },
    { value: "electricity", label: "전기·조명" },
    { value: "none", label: "해당 없음" },
    { value: "free", label: "그 외 (직접 입력)" },
  ],
  relationship: [
    { value: "communication", label: "소통이 어려워요" },
    { value: "interference", label: "간섭이 부담돼요" },
    { value: "rules", label: "규칙이 불편해요" },
    { value: "visitors", label: "방문객 관련" },
    { value: "noise", label: "소음·생활습관" },
    { value: "none", label: "해당 없음" },
    { value: "free", label: "그 외 (직접 입력)" },
  ],
  settlement: [
    { value: "utilities", label: "공과금이 이상해요" },
    { value: "extra-cost", label: "추가비용 요구" },
    { value: "deposit", label: "보증금 관련" },
    { value: "settlement-date", label: "정산일 문제" },
    { value: "none", label: "해당 없음" },
    { value: "free", label: "그 외 (직접 입력)" },
  ],
  urgent: [
    { value: "gas-electricity", label: "가스·누전" },
    { value: "unlocked-door", label: "문 안 잠김" },
    { value: "personal-safety", label: "신변 불안" },
    { value: "immediate-help", label: "즉시 도움 필요" },
    { value: "none", label: "해당 없음" },
    { value: "free", label: "그 외 (직접 입력)" },
  ],
  other: [{ value: "free", label: "그 외 (직접 입력)" }],
} as const satisfies Record<CheckinIssueTag, readonly CheckinDetailOption[]>;

export function getCheckinDetailOptions(tag: CheckinIssueTag) {
  return CHECKIN_DETAIL_OPTIONS[tag];
}
