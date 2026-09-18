import type { CheckinIssueTag, CheckinTagOption } from "@/domains/checkin";
import { ChipNormal } from "@/shared/ui/chip-normal";

interface ChatTagGridProps {
  tags: readonly CheckinTagOption[];
  excludeTags?: readonly CheckinIssueTag[];
  onSelect: (tag: CheckinTagOption) => void;
}

export function ChatTagGrid({
  tags,
  excludeTags = [],
  onSelect,
}: ChatTagGridProps) {
  const visibleTags = tags.filter((tag) => !excludeTags.includes(tag.value));

  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="불편 유형 선택">
      {visibleTags.map((tag) => (
        <ChipNormal
          key={tag.value}
          shape="square"
          size="lg"
          className={
            tag.urgent
              ? "border-system-error! text-system-error!"
              : "text-grayscale-600"
          }
          onClick={() => onSelect(tag)}
        >
          {tag.label}
        </ChipNormal>
      ))}
    </div>
  );
}
