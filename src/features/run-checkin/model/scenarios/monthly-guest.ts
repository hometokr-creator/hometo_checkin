import { CHECKIN_TAG_OPTIONS } from "@/domains/checkin";

import type { Scenario, ScenarioNext } from "../scenario";

const tagNext = {
  facility: { type: "step", stepId: "q_chip" },
  relationship: { type: "step", stepId: "q_chip" },
  settlement: { type: "step", stepId: "q_chip" },
  urgent: { type: "step", stepId: "q_chip_urgent" },
  other: { type: "step", stepId: "q_free" },
} as const satisfies Record<string, ScenarioNext>;

const secondTagNext = {
  facility: { type: "step", stepId: "q_chip2" },
  relationship: { type: "step", stepId: "q_chip2" },
  settlement: { type: "step", stepId: "q_chip2" },
  urgent: { type: "step", stepId: "q_chip_urgent" },
  other: { type: "step", stepId: "q_free2" },
} as const satisfies Record<string, ScenarioNext>;

export const monthlyGuestScenario = {
  id: "monthly-guest",
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
            next: { type: "step", stepId: "q_tag_soft" },
          },
          {
            value: "issue",
            label: "불편한 게 있어요",
            next: { type: "step", stepId: "q_tag" },
          },
        ],
      },
    },
    q_tag_soft: {
      id: "q_tag_soft",
      answerKey: "issueTag",
      message: { text: "다행이에요! 혹시 아주 사소하게라도 신경 쓰였던 건 없으셨어요?" },
      control: { kind: "tags", tags: CHECKIN_TAG_OPTIONS, nextByTag: tagNext },
    },
    q_tag: {
      id: "q_tag",
      answerKey: "issueTag",
      message: { text: "어떤 점이 불편하셨어요?\n편하게 골라주세요." },
      control: {
        kind: "tags",
        tags: CHECKIN_TAG_OPTIONS,
        nextByTag: tagNext,
      },
    },
    q_chip: {
      id: "q_chip",
      answerKey: "issueDetail",
      message: { text: "조금만 더 자세히 알려주시겠어요?" },
      control: { kind: "chips", next: { type: "step", stepId: "q_free" } },
    },
    q_more: {
      id: "q_more",
      answerKey: "hasAnotherIssue",
      message: { text: "혹시 다른 불편한 점도 있으세요?" },
      control: {
        kind: "options",
        options: [
          {
            value: "yes",
            label: "네, 더 있어요",
            next: { type: "step", stepId: "q_tag2" },
          },
          {
            value: "no",
            label: "이게 다예요",
            next: { type: "complete-from-answers" },
          },
        ],
      },
    },
    q_tag2: {
      id: "q_tag2",
      answerKey: "secondIssueTag",
      message: { text: "어떤 점이 더 불편하셨어요?" },
      control: {
        kind: "tags",
        tags: CHECKIN_TAG_OPTIONS,
        excludeSelected: true,
        nextByTag: secondTagNext,
      },
    },
    q_chip2: {
      id: "q_chip2",
      answerKey: "secondIssueDetail",
      message: { text: "그것도 조금 더 알려주시겠어요?" },
      control: { kind: "chips", next: { type: "step", stepId: "q_free2" } },
    },
    q_chip_urgent: {
      id: "q_chip_urgent",
      answerKey: "urgentDetail",
      message: { text: "어떤 도움이 필요하신가요?" },
      control: { kind: "chips", next: { type: "step", stepId: "q_free_urgent" } },
    },
    q_free_urgent: {
      id: "q_free_urgent",
      answerKey: "urgentFreeText",
      message: { text: "담당 매니저가 상황을 파악할 수 있도록 조금 더 알려주세요.\n적기 어려우시면 건너뛰셔도 괜찮아요." },
      control: {
        kind: "text",
        target: "issue",
        maxLength: 500,
        placeholder: "현재 상황과 필요한 도움을 적어주세요.",
        skipLabel: "건너뛰기",
        submitLabel: "보내기",
        next: { type: "complete-from-answers" },
      },
    },
    q_free2: {
      id: "q_free2",
      answerKey: "secondIssueFreeText",
      message: { text: "이 불편에 대해서도 더 알려주실 내용이 있으면 적어주세요.\n안 적으셔도 괜찮아요." },
      control: {
        kind: "text",
        target: "issue",
        maxLength: 500,
        placeholder: "담당 매니저가 참고하면 좋을 내용을 적어주세요.",
        skipLabel: "건너뛰기",
        submitLabel: "보내기",
        next: { type: "complete-from-answers" },
      },
    },
    q_free: {
      id: "q_free",
      answerKey: "issueFreeText",
      message: {
        text: "이 불편에 대해 더 알려주실 내용이 있으면 편하게 적어주세요.\n안 적으셔도 괜찮아요.",
      },
      control: {
        kind: "text",
        target: "issue",
        maxLength: 500,
        placeholder: "담당 매니저가 참고하면 좋을 내용을 적어주세요.",
        skipLabel: "건너뛰기",
        submitLabel: "보내기",
        next: { type: "step", stepId: "q_more" },
      },
    },
  },
  completionMessages: {
    ok: {
      text: "다행이에요! 알려주셔서 감사해요.\n다음 달에 또 가볍게 여쭤볼게요. 편안한 한 달 보내세요 😊",
    },
    reported: {
      text: "말씀 주셔서 감사해요.\n빠르게 확인하고 연락드릴게요 🙂",
    },
    urgent: {
      text: "알려주셔서 정말 감사해요.\n바로 확인해서 담당 매니저가 연락드릴게요.",
    },
    renewal: {
      text: "답변 감사해요 😊\n도와드릴 게 있으면 매니저가 안내드릴게요.",
    },
  },
} as const satisfies Scenario;
