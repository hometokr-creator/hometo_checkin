import { createGuestIssueScenario } from "./create-guest-issue-scenario";

export const onboardingD7Scenario = createGuestIssueScenario({
  id: "onboarding-d7-guest",
  answerKey: "onboardingStatus",
  introText:
    "{name}님, 입주하신 지 일주일 정도 됐네요 😊\n새로운 집에는 잘 적응하고 계세요?",
  okayLabel: "네, 잘 적응하고 있어요",
  issueLabel: "도움이 필요한 게 있어요",
  okayCompletionText:
    "잘 적응하고 계시다니 다행이에요!\n지내시다 도움이 필요하면 언제든 편하게 알려주세요 😊",
});
