import type {
  CheckinAnswers,
  CheckinIssueTag,
  CheckinTagOption,
} from "@/domains/checkin";

export type StepId = string;

export type CompletionOutcome = "ok" | "reported" | "urgent" | "renewal";

export type ScenarioNext =
  | { type: "step"; stepId: StepId }
  | { type: "complete"; outcome: CompletionOutcome }
  | { type: "complete-from-answers" }
  | {
      type: "issue-count";
      lessThan: number;
      then: StepId;
      otherwise: StepId;
    };

export interface BotMessage {
  text: string;
}

export interface OptionAnswer {
  value: string;
  label: string;
  next: ScenarioNext;
  presetIssueTag?: CheckinIssueTag;
}

export interface OptionControl {
  kind: "options";
  options: readonly OptionAnswer[];
}

export interface TagControl {
  kind: "tags";
  tags: readonly CheckinTagOption[];
  excludeSelected?: boolean;
  nextByTag: Record<CheckinIssueTag, ScenarioNext>;
}

export interface ChipControl {
  kind: "chips";
  next: ScenarioNext;
}

export interface TextControl {
  target?: "issue" | "checkin";
  kind: "text";
  maxLength: number;
  placeholder: string;
  skipLabel: string;
  submitLabel: string;
  next: ScenarioNext;
}

export type AnswerControl = OptionControl | TagControl | ChipControl | TextControl;

export interface ScenarioStep {
  id: StepId;
  answerKey: string;
  message: BotMessage;
  control: AnswerControl;
}

export interface Scenario {
  id: string;
  entry: StepId;
  steps: Record<StepId, ScenarioStep>;
  completionMessages: Record<CompletionOutcome, BotMessage>;
}

export interface ScenarioContext {
  name: string;
  eventItemName: string;
}

export interface TranscriptMessage {
  id: string;
  role: "bot" | "user";
  text: string;
}

export type CheckinMachineStatus = "active" | "submitting" | "completed" | "error";

export interface CheckinMachineState {
  status: CheckinMachineStatus;
  currentStepId?: StepId;
  pendingOutcome?: CompletionOutcome;
  transcript: TranscriptMessage[];
  answers: CheckinAnswers;
  nextMessageId: number;
  errorCode?: string;
}

