import "server-only";
import { pinnedScenario, type SessionRow } from "../checkin/scenario-registry";
import { ADMIN_TAGS, type AdminTag } from "@/domains/admin-responses/model";
import { getCheckinDetailOptions } from "@/domains/checkin/model/checkin-options";
import type { Scenario, ScenarioStep } from "@/features/run-checkin/model/scenario";

export function adminScenario(row: SessionRow) {
  try { return pinnedScenario(row); } catch { return null; }
}
export function questionLabel(step: ScenarioStep | undefined, name = "입주자") {
  return step?.message.text.replaceAll("{name}", () => name) ?? "질문 내용을 확인할 수 없음";
}
export function stepTag(step: ScenarioStep, responses: Record<string, string>): AdminTag | null {
  const tag = ["urgentDetail", "urgentFreeText"].includes(step.answerKey) ? "urgent"
    : ["secondIssueDetail", "secondIssueFreeText"].includes(step.answerKey) ? responses.secondIssueTag : responses.issueTag;
  return Object.hasOwn(ADMIN_TAGS, tag ?? "") ? tag as AdminTag : null;
}
export function timelineForResponse(
  scenario: Scenario | null,
  events: { step_id: string; reached_at: string }[],
  responses: Record<string, string>,
  issues: { tag: AdminTag; free_text: string | null }[],
  name: string,
) {
  return [...events].sort((a, b) => Date.parse(a.reached_at) - Date.parse(b.reached_at)).map((event) => {
    const step = scenario?.steps[event.step_id];
    let answer = "최종 답변 기록 없음";
    if (step) {
      const value = responses[step.answerKey];
      const control = step.control;
      if (control.kind === "options") answer = control.options.find((option) => option.value === value)?.label ?? answer;
      else if (control.kind === "tags") answer = control.tags.find((option) => option.value === value)?.label ?? answer;
      else if (control.kind === "chips") {
        const tag = stepTag(step, responses);
        if (tag) answer = getCheckinDetailOptions(tag).find((option) => option.value === value)?.label ?? answer;
      } else if (value === "skipped") answer = "건너뜀";
      else if (value === "provided") {
        const tag = stepTag(step, responses);
        const text = issues.find((issue) => issue.tag === tag)?.free_text;
        answer = text ? `작성함 ${Array.from(text).length}자` : "작성함 · 글자 수 확인 불가";
      }
    }
    return { at: event.reached_at, question: questionLabel(step, name), answer };
  });
}
