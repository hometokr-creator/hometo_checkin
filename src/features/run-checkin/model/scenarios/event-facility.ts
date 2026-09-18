import type { Scenario } from "../scenario";

export const facilityEventScenario = {
  id: "facility-event-guest",
  entry: "q_status",
  steps: {
    q_status: {
      id: "q_status",
      answerKey: "facilityEventStatus",
      message: {
        text: "{name}님, 지난번 말씀하신 {eventItemName}은 확인해 보셨나요?\n지금은 괜찮으세요?",
      },
      control: {
        kind: "options",
        options: [
          {
            value: "resolved",
            label: "네, 이제 괜찮아요",
            next: { type: "step", stepId: "q_free_ok" },
          },
          {
            value: "unresolved",
            label: "아직 불편해요",
            presetIssueTag: "facility",
            next: { type: "step", stepId: "q_detail" },
          },
        ],
      },
    },
    q_detail: {
      id: "q_detail",
      answerKey: "facilityEventDetail",
      message: { text: "어떤 상태인지 조금만 더 알려주시겠어요?" },
      control: {
        kind: "chips",
        next: { type: "step", stepId: "q_free" },
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
        text: "담당 매니저가 확인할 때 참고하면 좋을 내용을 적어주세요.\n안 적으셔도 괜찮아요.",
      },
      control: {
        kind: "text",
        target: "issue",
        maxLength: 500,
        placeholder: "현재 상태나 확인이 필요한 내용을 적어주세요.",
        skipLabel: "건너뛰기",
        submitLabel: "보내기",
        next: { type: "complete", outcome: "reported" },
      },
    },
  },
  completionMessages: {
    ok: {
      text: "이제 괜찮다니 다행이에요!\n다시 불편해지면 언제든 알려주세요 😊",
    },
    reported: {
      text: "아직 불편하시군요. 알려주셔서 감사해요.\n담당 매니저가 확인하고 연락드릴게요.",
    },
    urgent: {
      text: "알려주셔서 정말 감사해요.\n바로 확인해서 담당 매니저가 연락드릴게요.",
    },
    renewal: { text: "답변 감사해요 😊" },
  },
} as const satisfies Scenario;
