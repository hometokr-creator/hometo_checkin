import {
  getCheckinDetailOptions,
  type CheckinAnswers,
  type CheckinDetailOption,
  type CheckinTagOption,
} from "@/domains/checkin";
import {
  ChatChipGrid,
  ChatOptionButtons,
  ChatTagGrid,
  ChatTextInput,
  type OptionAnswer,
  type ScenarioStep,
} from "@/features/run-checkin";

interface CheckinControlProps {
  step: ScenarioStep;
  answers: CheckinAnswers;
  onSelectOption: (option: OptionAnswer) => void;
  onSelectTag: (tag: CheckinTagOption) => void;
  onSelectDetail: (detail: CheckinDetailOption) => void;
  onSubmitText: (text: string) => void;
}

export function CheckinControl({
  step,
  answers,
  onSelectOption,
  onSelectTag,
  onSelectDetail,
  onSubmitText,
}: CheckinControlProps) {
  switch (step.control.kind) {
    case "options":
      return (
        <ChatOptionButtons
          options={step.control.options}
          onSelect={onSelectOption}
        />
      );
    case "tags":
      return (
        <ChatTagGrid
          tags={step.control.tags}
          excludeTags={
            step.control.excludeSelected
              ? answers.issues.map((issue) => issue.tag)
              : undefined
          }
          onSelect={onSelectTag}
        />
      );
    case "chips": {
      const currentIssue = answers.issues.at(-1);
      if (!currentIssue) return null;

      return (
        <ChatChipGrid
          chips={getCheckinDetailOptions(currentIssue.tag)}
          onSelect={onSelectDetail}
        />
      );
    }
    case "text":
      return (
        <ChatTextInput
          key={step.id}
          maxLength={step.control.maxLength}
          placeholder={step.control.placeholder}
          skipLabel={step.control.skipLabel}
          submitLabel={step.control.submitLabel}
          onSubmit={onSubmitText}
        />
      );
  }
}
