import type { Scenario } from "../scenario";

export const chatPreviewScenario = {
  id: "chat-preview-guest",
  entry: "q_main",
  steps: {
    q_main: {
      id: "q_main",
      answerKey: "monthlyStatus",
      message: {
        text: "{name}님, 안녕하세요 😊\n이번 달은 잘 지내셨어요? 정산도 별문제 없으셨고요?",
      },
      control: {
        kind: "options",
        options: [
          {
            value: "ok",
            label: "네, 다 괜찮아요",
            next: { type: "complete", outcome: "ok" },
          },
          {
            value: "issue",
            label: "불편한 게 있어요",
            next: { type: "complete", outcome: "reported" },
          },
        ],
      },
    },
  },
  completionMessages: {
    ok: {
      text: "다행이에요! 알려주셔서 감사해요.\n다음 달에 또 가볍게 여쭤볼게요 😊",
    },
    reported: {
      text: "말씀 주셔서 감사해요.\n상세 내용을 이어서 받는 화면은 곧 준비할게요.",
    },
    urgent: {
      text: "알려주셔서 감사해요. 바로 확인해서 담당 매니저가 연락드릴게요.",
    },
    renewal: {
      text: "답변 감사해요 😊 도와드릴 게 있으면 매니저가 안내드릴게요.",
    },
  },
} as const satisfies Scenario;

