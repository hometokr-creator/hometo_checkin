import { loadAdminStats } from "@/server/admin/statistics";
import { AdminStatsDashboard } from "@/widgets/admin-stats/stats-dashboard";

export async function AdminStatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const result = await loadAdminStats(await searchParams);
  if (!result.ok) return <section role="alert" className="rounded-xl border border-grayscale-200 bg-white p-8">
    <h1 className="text-2xl font-extrabold">통계를 불러올 수 없습니다</h1><p className="mt-3 text-sm text-grayscale-600">{result.reason === "filters" ? "조회 기간과 회차를 확인해 주세요." : "연결 상태를 확인한 뒤 다시 시도해 주세요. 조회 실패를 0건으로 표시하지 않습니다."}</p>
    <a href="/admin/stats" className="mt-5 inline-block rounded-lg border border-grayscale-300 px-4 py-2 text-sm">최근 30일 다시 조회</a>
  </section>;
  return <AdminStatsDashboard data={result.data} />;
}
