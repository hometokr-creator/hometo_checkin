import type { CheckinDetailOption } from "@/domains/checkin";
import { ChipNormal } from "@/shared/ui/chip-normal";

interface ChatChipGridProps {
  chips: readonly CheckinDetailOption[];
  onSelect: (chip: CheckinDetailOption) => void;
}

export function ChatChipGrid({ chips, onSelect }: ChatChipGridProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="상세 내용 선택">
      {chips.map((chip) => (
        <ChipNormal key={chip.value} onClick={() => onSelect(chip)}>
          {chip.label}
        </ChipNormal>
      ))}
    </div>
  );
}
