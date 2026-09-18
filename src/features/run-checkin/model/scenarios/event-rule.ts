import type { Scenario } from "../scenario";

export const ruleEventScenario = {
  id: "rule-event-guest",
  entry: "q_status",
  steps: {
    q_status: {
      id: "q_status",
      answerKey: "ruleEventStatus",
      message: {
        text: "{name}님, 지난번 안내드린 생활 규칙은 확인하셨나요?\n지내시는 데 어려운 점은 없으세요?",
      },
      control: {
        kind: "options",
        options: [
          {
            value: "understood",
            label: "네, 괜찮아요",
            next: { type: "step", stepId: "q_free_ok" },
          },
          {
            value: "needs-help",
            label: "확인이 필요해요",
            presetIssueTag: "other",
            next: { type: "step", stepId: "q_free" },
          },
        ],
      },
    },
    q_free_ok: {
      id: "q_free_ok",
      answerKey: "freeText",
      message: { text: "더 하고 싶은 말씀이 있으면 편하게 적어주세요.\n안 적으셔도 괜찮아요." },
      control: {
        kind: "text",
        maxLength: 500,
        placeholder: "담당 매니저가 참고하면 좋을 내용을 적어주세요.",
        skipLabel: "건너뛰기",
        submitLabel: "보내기",
        next: { type: "complete-from-answers" },
      },
    },
    q_free: {
      id: "q_free",
      answerKey: "freeText",
      message: {
        text: "어떤 부분이 어렵거나 궁금한지 편하게 적어주세요.",
      },
      control: {
        kind: "text",
        target: "issue",
        maxLength: 500,
        placeholder: "확인이 필요한 규칙이나 상황을 적어주세요.",
        skipLabel: "건너뛰기",
        submitLabel: "보내기",
        next: { type: "complete", outcome: "reported" },
      },
    },
  },
  completionMessages: {
    ok: {
      text: "확인해 주셔서 감사해요!\n지내시다 궁금한 점이 생기면 편하게 알려주세요 😊",
    },
    reported: {
      text: "알려주셔서 감사해요.\n담당 매니저가 확인하고 안내드릴게요.",
    },
    urgent: {
      text: "알려주셔서 정말 감사해요.\n바로 확인해서 담당 매니저가 연락드릴게요.",
    },
    renewal: { text: "답변 감사해요 😊" },
  },
} as const satisfies Scenario;
