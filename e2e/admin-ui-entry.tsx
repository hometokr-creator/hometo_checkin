import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ResponseInbox } from "../src/widgets/admin-responses/response-inbox";
import type { AdminInboxData, AdminResponse, ReviewAction } from "../src/domains/admin-responses/model";

const person = { id: "person", name: "가상 김하나", phone: "010-0000-0001", property: "테스트하우스 101호", host: "가상 집주인", contractStart: "2026-01-01", contractEnd: "2027-01-01" };
const base: AdminResponse = { id: "response-1", sessionId: "session-1", participant: person, round: "monthly", outcome: "reported", submittedAt: "2026-09-08T01:00:00Z", reviewedAt: null, initiallyPositive: true, labelsAvailable: true,
  issues: [{ id: "issue-1", tag: "facility", detailLabel: "난방·에어컨", freeText: "난방이 잘 되지 않아요.\n두 번째 줄 원문입니다." }, { id: "issue-2", tag: "settlement", detailLabel: "공과금이 이상해요", freeText: null }],
  interest: { exposed: true, clicked: true, topicsSubmitted: true, topics: ["생활 습관"] } };
const fixture: AdminInboxData = { now: "2026-09-08T03:00:00Z", responses: [base,
  { ...base, id: "urgent", initiallyPositive: false, outcome: "urgent", participant: { ...person, id: "second", name: "가상 이긴급", phone: "010-0000-0002" }, submittedAt: "2026-09-07T01:00:00Z", issues: [{ id: "urgent-issue", tag: "urgent", detailLabel: "문 안 잠김", freeText: "문이 잠기지 않아요." }] },
  { ...base, id: "okay", participant: { ...person, id: "third", name: "가상 박평온" }, outcome: "ok", issues: [], initiallyPositive: true, reviewedAt: "2026-09-08T02:00:00Z" },
  { ...base, id: "old", round: "monthly-first", submittedAt: "2026-07-01T01:00:00Z", initiallyPositive: false, issues: [{ id: "old-issue", tag: "facility", detailLabel: "난방·에어컨", freeText: "지난달에도 문의했어요." }] },
], urgentPending: [{ sessionId: "pending", name: "가상 미제출", property: "테스트하우스 201호", round: "monthly", reachedAt: "2026-09-08T02:00:00Z", expiresAt: "2026-09-20T00:00:00Z" }] };

function App() {
  const [data, setData] = useState(fixture);
  const [writes, setWrites] = useState(0);
  const action: ReviewAction = async (id, reviewed) => {
    if (new URL(location.href).searchParams.has("fail")) return { ok: false, message: "확인 상태를 저장하지 못했습니다." };
    setWrites((n) => n + 1);
    setData((previous) => ({ ...previous, responses: previous.responses.map((r) => r.id === id ? { ...r, reviewedAt: reviewed ? r.reviewedAt ?? fixture.now : null } : r) }));
    return { ok: true };
  };
  return <main className="mx-auto max-w-[1440px] p-6"><output data-testid="writes" hidden>{writes}</output><ResponseInbox data={data} reviewAction={action} /></main>;
}
createRoot(document.getElementById("root")!).render(<App />);
