import type { Scenario } from "../scenario";
import { createGuestIssueScenario } from "./create-guest-issue-scenario";

const issueScenario = createGuestIssueScenario({
  id: "monthly-renewal-guest",
  answerKey: "renewalSupportStatus",
  introText: "",
  okayLabel: "괜찮아요",
  issueLabel: "도움이 필요해요",
  okayCompletionText: "답변 감사해요 😊",
});

export const renewalGuestScenario = {
  ...issueScenario,
  entry: "q_intent",
  steps: {
    ...issueScenario.steps,
    q_intent: {
      id: "q_intent",
      answerKey: "renewalIntent",
      message: {
        text: "{name}님, 계약 종료일이 다가오고 있어요.\n재계약에 대해 어떻게 생각하고 계세요?",
      },
      control: {
        kind: "options",
        options: [
          {
            value: "renew",
            label: "계속 살고 싶어요",
            next: { type: "step", stepId: "q_support" },
          },
          {
            value: "considering",
            label: "아직 고민 중이에요",
            next: { type: "step", stepId: "q_support" },
          },
          {
            value: "move-out",
            label: "이사할 예정이에요",
            next: { type: "step", stepId: "q_support" },
          },
        ],
      },
    },
    q_support: {
      id: "q_support",
      answerKey: "renewalSupportStatus",
      message: {
        text: "결정하시거나 남은 기간을 지내는 데 도움이 필요한 부분이 있으세요?",
      },
      control: {
        kind: "options",
        options: [
          {
            value: "none",
            label: "지금은 괜찮아요",
            next: { type: "step", stepId: "q_tag_soft" },
          },
          {
            value: "needed",
            label: "도움이 필요해요",
            next: { type: "step", stepId: "q_tag" },
          },
        ],
      },
    },
  },
} as const satisfies Scenario;
