import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { monthlyGuestScenario } from "@/features/run-checkin/model/scenarios/monthly-guest";
import { timelineForResponse } from "./scenario-labels";

describe("response timeline", () => {
  it("orders by recorded time and uses scenario question and choice labels", () => {
    const rows = timelineForResponse(monthlyGuestScenario, [{ step_id: "q_tag_soft", reached_at: "2026-09-08T00:00:05Z" }, { step_id: "q_main", reached_at: "2026-09-08T00:00:00Z" }], { monthlyStatus: "ok", issueTag: "facility" }, [], "가상 고객");
    expect(rows[0].answer).toBe("네, 다 괜찮아요");
    expect(rows[0].question).toContain("가상 고객님");
    expect(rows[1].question).toBe(monthlyGuestScenario.steps.q_tag_soft.message.text);
  });
  it("matches text by tag after an empty first other issue was removed", () => {
    const rows = timelineForResponse(monthlyGuestScenario, [{ step_id: "q_free", reached_at: "2026-09-08T00:00:00Z" }, { step_id: "q_free2", reached_at: "2026-09-08T00:00:10Z" }], { issueTag: "other", issueFreeText: "skipped", secondIssueTag: "facility", secondIssueFreeText: "provided" }, [{ tag: "facility", free_text: "난방🔥" }], "고객");
    expect(rows.map((row) => row.answer)).toEqual(["건너뜀", "작성함 3자"]);
    expect(JSON.stringify(rows)).not.toContain("난방🔥");
  });
  it("does not invent events or expose unknown step/answer codes", () => {
    expect(timelineForResponse(monthlyGuestScenario, [], {}, [], "고객")).toEqual([]);
    const rows = timelineForResponse(null, [{ step_id: "private-step-code", reached_at: "2026-09-08" }], { private: "secret-code" }, [], "고객");
    expect(JSON.stringify(rows)).not.toMatch(/private-step-code|secret-code/);
    expect(rows[0].question).toBe("질문 내용을 확인할 수 없음");
  });
  it("looks up urgent chip labels from the existing domain definition", () => {
    const rows = timelineForResponse(monthlyGuestScenario, [{ step_id: "q_chip_urgent", reached_at: "2026-09-08" }], { urgentDetail: "unlocked-door" }, [], "고객");
    expect(rows[0].answer).toBe("문 안 잠김");
  });
});
