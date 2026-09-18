import { BtnCta } from "@/shared/ui/btn-cta";

import type { OptionAnswer } from "../model/scenario";

interface ChatOptionButtonsProps {
  options: readonly OptionAnswer[];
  onSelect: (option: OptionAnswer) => void;
  disabled?: boolean;
}

export function ChatOptionButtons({
  options,
  onSelect,
  disabled = false,
}: ChatOptionButtonsProps) {
  return (
    <div className="grid gap-2" role="group" aria-label="답변 선택">
      {options.map((option, index) => (
        <BtnCta
          key={option.value}
          variant={index === 0 ? "default" : "stroke"}
          size="l"
          className="h-auto min-h-[52px] w-full"
          disabled={disabled}
          onClick={() => onSelect(option)}
        >
          {option.label}
        </BtnCta>
      ))}
    </div>
  );
}

