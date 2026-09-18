import { createGuestIssueScenario } from "./create-guest-issue-scenario";

export const monthlyFirstScenario = createGuestIssueScenario({
  id: "monthly-first-guest",
  answerKey: "firstMonthStatus",
  introText:
    "{name}님, 첫 한 달은 잘 보내셨어요? 😊\n생활이나 정산에서 불편한 점은 없으셨나요?",
  okayLabel: "네, 잘 지냈어요",
  issueLabel: "불편한 게 있었어요",
  okayCompletionText:
    "첫 한 달을 잘 보내셨다니 다행이에요!\n다음 체크인 때 다시 가볍게 여쭤볼게요 😊",
});
