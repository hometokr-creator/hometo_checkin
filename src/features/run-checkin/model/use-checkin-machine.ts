"use client";

import { useEffect, useReducer } from "react";
import { CheckinApiError } from "@/domains/checkin/api/http";

import {
  getCheckinDetailOptions,
  submitCheckinAnswer,
  type CheckinAnswers,
  type CheckinDetailOption,
  type CheckinIssue,
  type CheckinSession,
  type CheckinTagOption,
} from "@/domains/checkin";

import type {
  CheckinMachineState,
  OptionAnswer,
  Scenario,
  ScenarioContext,
  ScenarioNext,
} from "./scenario";
import { getIssueTriageLevel, getOverallTriageLevel } from "./triage";

interface UseCheckinMachineOptions {
  scenario: Scenario;
  session: CheckinSession;
}

type MachineAction =
  | { type: "answer-option"; option: OptionAnswer }
  | { type: "select-tag"; tag: CheckinTagOption }
  | { type: "select-detail"; detail: CheckinDetailOption }
  | { type: "submit-text"; text: string }
  | { type: "submit-succeeded"; outcome?: "ok" | "reported" | "urgent"; completionMessage?: string }
  | { type: "submit-failed"; errorCode?: string }
  | { type: "retry-submit" };

function interpolate(text: string, context: ScenarioContext) {
  return text
    .replaceAll("{name}", context.name)
    .replaceAll("{eventItemName}", context.eventItemName);
}

function createInitialAnswers(): CheckinAnswers {
  return { responses: {}, issues: [] };
}

export function createInitialState(scenario: Scenario, context: ScenarioContext): CheckinMachineState {
  const entry = scenario.steps[scenario.entry];

  if (!entry) {
    throw new Error(`Scenario entry step not found: ${scenario.entry}`);
  }

  return {
    status: "active",
    currentStepId: entry.id,
    transcript: [
      {
        id: "message-0",
        role: "bot",
        text: interpolate(entry.message.text, context),
      },
    ],
    answers: createInitialAnswers(),
    nextMessageId: 1,
  };
}

function appendUserMessage(state: CheckinMachineState, text: string): CheckinMachineState {
  return {
    ...state,
    transcript: [
      ...state.transcript,
      {
        id: `message-${state.nextMessageId}`,
        role: "user",
        text,
      },
    ],
    nextMessageId: state.nextMessageId + 1,
  };
}

function advance(
  state: CheckinMachineState,
  next: ScenarioNext,
  scenario: Scenario,
  context: ScenarioContext,
): CheckinMachineState {
  if (next.type === "complete-from-answers") {
    const issues = state.answers.issues.filter(
      (issue) => issue.tag !== "other" || Boolean(issue.freeText?.trim() || state.answers.freeText?.trim()),
    );
    const overallTriage = getOverallTriageLevel(issues);
    return advance(
      { ...state, answers: { ...state.answers, issues, overallTriage } },
      {
        type: "complete",
        outcome: overallTriage === "R1" ? "urgent" : issues.length > 0 || state.answers.freeText ? "reported" : "ok",
      },
      scenario,
      context,
    );
  }

  if (next.type === "issue-count") {
    const stepId =
      state.answers.issues.length < next.lessThan ? next.then : next.otherwise;
    return advance(state, { type: "step", stepId }, scenario, context);
  }

  if (next.type === "complete") {
    return {
      ...state,
      status: "submitting",
      currentStepId: undefined,
      pendingOutcome: next.outcome,
    };
  }

  const nextStep = scenario.steps[next.stepId];
  if (!nextStep) {
    throw new Error(`Scenario step not found: ${next.stepId}`);
  }

  return {
    ...state,
    currentStepId: nextStep.id,
    transcript: [
      ...state.transcript,
      {
        id: `message-${state.nextMessageId}`,
        role: "bot",
        text: interpolate(nextStep.message.text, context),
      },
    ],
    nextMessageId: state.nextMessageId + 1,
  };
}

function updateResponses(
  answers: CheckinAnswers,
  answerKey: string,
  value: string,
): CheckinAnswers {
  return {
    ...answers,
    responses: { ...answers.responses, [answerKey]: value },
  };
}

export function createMachineReducer(scenario: Scenario, context: ScenarioContext) {
  return (state: CheckinMachineState, action: MachineAction): CheckinMachineState => {
    if (action.type === "submit-succeeded") {
      if (state.status !== "submitting" || !state.pendingOutcome) return state;

      const completionMessage = scenario.completionMessages[action.outcome ?? state.pendingOutcome];
      return {
        ...state,
        status: "completed",
        transcript: [
          ...state.transcript,
          {
            id: `message-${state.nextMessageId}`,
            role: "bot",
            text: interpolate(action.completionMessage ?? completionMessage.text, context),
          },
        ],
        nextMessageId: state.nextMessageId + 1,
      };
    }

    if (action.type === "submit-failed") {
      return state.status === "submitting" ? { ...state, status: "error", errorCode: action.errorCode } : state;
    }

    if (action.type === "retry-submit") {
      return state.status === "error" ? { ...state, status: "submitting" } : state;
    }

    if (state.status !== "active" || !state.currentStepId) return state;

    const currentStep = scenario.steps[state.currentStepId];
    if (!currentStep) return state;

    if (action.type === "answer-option") {
      if (currentStep.control.kind !== "options") return state;

      const option = currentStep.control.options.find(
        (candidate) => candidate.value === action.option.value,
      );
      if (!option) return state;

      const answers = updateResponses(state.answers, currentStep.answerKey, option.value);
      const issues = option.presetIssueTag
        ? [
            ...answers.issues,
            {
              tag: option.presetIssueTag,
              triageLevel: getIssueTriageLevel(option.presetIssueTag),
            } satisfies CheckinIssue,
          ]
        : answers.issues;
      const answeredState = appendUserMessage(
        {
          ...state,
          answers: {
            ...answers,
            issues,
            overallTriage: getOverallTriageLevel(issues),
          },
        },
        option.label,
      );
      return advance(answeredState, option.next, scenario, context);
    }

    if (action.type === "select-tag") {
      if (currentStep.control.kind !== "tags") return state;
      if (state.answers.issues.length >= 2) return state;

      const tag = currentStep.control.tags.find(
        (candidate) => candidate.value === action.tag.value,
      );
      if (!tag) return state;
      if (
        currentStep.control.excludeSelected &&
        state.answers.issues.some((issue) => issue.tag === tag.value)
      ) {
        return state;
      }

      const issue: CheckinIssue = {
        tag: tag.value,
        triageLevel: getIssueTriageLevel(tag.value),
      };
      const issues = [...state.answers.issues, issue];
      const answers = updateResponses(state.answers, currentStep.answerKey, tag.value);
      const answeredState = appendUserMessage(
        {
          ...state,
          answers: {
            ...answers,
            issues,
            overallTriage: getOverallTriageLevel(issues),
          },
        },
        tag.label,
      );
      return advance(
        answeredState,
        currentStep.control.nextByTag[tag.value],
        scenario,
        context,
      );
    }

    if (action.type === "select-detail") {
      if (currentStep.control.kind !== "chips") return state;

      const currentIssue = state.answers.issues.at(-1);
      if (!currentIssue) return state;

      const detail = getCheckinDetailOptions(currentIssue.tag).find(
        (candidate) => candidate.value === action.detail.value,
      );
      if (!detail) return state;

      const issues = state.answers.issues.map((issue, index) =>
        index === state.answers.issues.length - 1
          ? { ...issue, detail: detail.value }
          : issue,
      );
      const answeredState = appendUserMessage(
        {
          ...state,
          answers: {
            ...updateResponses(state.answers, currentStep.answerKey, detail.value),
            issues,
          },
        },
        detail.label,
      );
      return advance(answeredState, currentStep.control.next, scenario, context);
    }

    if (action.type === "submit-text") {
      if (currentStep.control.kind !== "text") return state;

      const text = action.text.trim().slice(0, currentStep.control.maxLength);
      const answersWithResponse = updateResponses(
        state.answers,
        currentStep.answerKey,
        text ? "provided" : "skipped",
      );
      const answers: CheckinAnswers = currentStep.control.target === "issue"
        ? {
            ...answersWithResponse,
            issues: answersWithResponse.issues.map((issue, index) =>
              index === answersWithResponse.issues.length - 1 && text
                ? { ...issue, freeText: text }
                : issue,
            ),
          }
        : text ? {
            ...answersWithResponse,
            freeText: text,
            issues: answersWithResponse.issues.length > 0
              ? answersWithResponse.issues
              : [{ tag: "other", freeText: text, triageLevel: "R2" }],
            overallTriage: answersWithResponse.overallTriage ?? "R2",
          } : answersWithResponse;
      const answeredState = appendUserMessage(
        { ...state, answers },
        text || currentStep.control.skipLabel,
      );
      return advance(answeredState, currentStep.control.next, scenario, context);
    }

    return state;
  };
}

export function useCheckinMachine({ scenario, session }: UseCheckinMachineOptions) {
  const context: ScenarioContext = {
    name: session.displayName ?? "입주자",
    eventItemName:
      session.eventContext?.type === "facility"
        ? session.eventContext.itemName
        : "안내드린 내용",
  };
  const [state, dispatch] = useReducer(
    createMachineReducer(scenario, context),
    undefined,
    () => createInitialState(scenario, context),
  );

  useEffect(() => {
    if (state.status !== "submitting" || !state.pendingOutcome) return;

    let isCurrent = true;

    void submitCheckinAnswer({
      schemaVersion: 1,
      sessionId: session.id,
      idempotencyKey: `${session.id}:${scenario.id}:v1`,
      answers: state.answers,
    })
      .then((result) => {
        if (isCurrent) dispatch({ type: "submit-succeeded", outcome: result.outcome, completionMessage: result.completionMessage });
      })
      .catch((error: unknown) => {
        if (isCurrent) dispatch({ type: "submit-failed", errorCode: error instanceof CheckinApiError ? error.code : undefined });
      });

    return () => {
      isCurrent = false;
    };
  }, [scenario.id, session.id, state.answers, state.pendingOutcome, state.status]);

  const currentStep = state.currentStepId
    ? scenario.steps[state.currentStepId]
    : undefined;

  return {
    state,
    currentStep,
    selectOption: (option: OptionAnswer) =>
      dispatch({ type: "answer-option", option }),
    selectTag: (tag: CheckinTagOption) => dispatch({ type: "select-tag", tag }),
    selectDetail: (detail: CheckinDetailOption) =>
      dispatch({ type: "select-detail", detail }),
    submitText: (text: string) => dispatch({ type: "submit-text", text }),
    retrySubmit: () => dispatch({ type: "retry-submit" }),
  };
}
