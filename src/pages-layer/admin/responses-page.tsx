import { loadAdminResponses } from "@/server/admin/responses";
import { setResponseReviewed } from "@/features/review-response/actions";
import { ResponseInbox } from "@/widgets/admin-responses/response-inbox";

export async function AdminResponsesPage() {
  const result = await loadAdminResponses();
  if (!result.ok) return <section className="rounded-xl border border-grayscale-200 bg-white p-8" role="alert">
    <h1 className="text-2xl font-extrabold">응답을 불러올 수 없습니다</h1>
    <p className="mt-3 text-sm text-grayscale-600">{result.reason === "setup" ? "운영자 화면의 데이터 연결 준비가 필요합니다. 설정을 마친 뒤 다시 확인해 주세요." : "연결 상태를 확인한 뒤 다시 시도해 주세요. 조회 실패를 응답 없음으로 표시하지 않습니다."}</p>
    <a href="/admin/responses" className="mt-5 inline-block rounded-lg border border-grayscale-300 px-4 py-2 text-sm">다시 불러오기</a>
  </section>;
  return <ResponseInbox data={result.data} reviewAction={setResponseReviewed} />;
}
