export const COMMUNITY_INTEREST_TITLE = "나만 이런가? 다른 분들은 어떻게 지내는지 궁금하셨죠?";

export function getCommunityInterestTitle(interestHookPercent?: number) {
  if (interestHookPercent === undefined || !Number.isFinite(interestHookPercent) ||
      interestHookPercent < 0 || interestHookPercent > 100) {
    return COMMUNITY_INTEREST_TITLE;
  }
  return `입주자의 ${interestHookPercent}%가 관심을 보였어요. 다른 분들은 어떻게 지내는지 궁금하셨죠?`;
}
