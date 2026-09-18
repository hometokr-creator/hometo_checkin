import { ADMIN_ROUNDS, formatAdminTime, formatElapsed } from "@/domains/admin-responses/model";
import { formatRatio, METRIC_LABELS, type Distribution, type MetricKey, type Ratio, type StatsPageData, type StatsSummary } from "@/domains/admin-responses/statistics";

const descriptions: Record<MetricKey, string> = {
  participation: "발송 성공 세션 중 제출 완료", entry: "발송 성공 세션 중 진행 기록 있음", completion: "진행 기록이 있는 세션 중 제출 완료", incomplete: "진행 기록이 있으나 아직 미제출",
  reported: "완료 응답 중 실제 불만 있음", urgent: "완료 응답 중 긴급 태그 불만 있음", description: "전체 불만 항목 중 설명이 있음", writing: "자유어 답변이 있는 완료자 중 작성함",
  interestPerCompleted: "완료자 중 관심 표시", interestPerExposed: "관심 카드 노출 기록 중 관심 표시", soft: "처음 긍정 답변을 한 완료자 중 불만 있음", reminder: "리마인더 발송 성공 세션 중 발송 뒤 제출",
};
function RatioValue({ ratio }: { ratio: Ratio }) { return <span data-testid="ratio" className="tabular-nums">{formatRatio(ratio)}</span>; }
function Bars({ title, description, rows }: { title: string; description: string; rows: Distribution[] }) {
  return <section aria-label={title} className="min-w-0 rounded-xl border border-grayscale-200 bg-white p-5">
    <h2 className="font-extrabold">{title}</h2><p className="mt-2 text-xs leading-5 text-grayscale-600">{description}</p>
    {rows.length ? <ul className="mt-5 space-y-4">{rows.map((row) => <li key={row.label}>
      <div className="mb-2 flex items-start justify-between gap-4 text-sm"><span className="min-w-0 whitespace-pre-line break-words">{row.label}</span><span className="shrink-0 text-grayscale-600"><RatioValue ratio={row} /></span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-grayscale-100" aria-hidden="true"><div className="h-full rounded-full bg-primary-400" style={{ width: `${row.d > 0 ? Math.min(100, row.n / row.d * 100) : 0}%` }} /></div>
    </li>)}</ul> : <p className="mt-5 text-sm text-grayscale-600">해당하는 기록이 없습니다.</p>}
  </section>;
}
const time = (value: number | null) => value === null ? "계산 불가" : formatElapsed(value);
function Comparison({ data }: { data: StatsPageData }) {
  const counts: { label: string; value: (s: StatsSummary) => string }[] = [
    { label: "최초 발송", value: (s) => `${s.sent}건` }, { label: "제출 완료", value: (s) => `${s.completed}건 / 발송 ${s.sent}건` },
    { label: "진행 기록 없는 완료", value: (s) => `${s.completedWithoutProgress}건 / 완료 ${s.completed}건` },
    { label: "진행 중 미완료", value: (s) => `${s.pending}건 / 발송 ${s.sent}건` }, { label: "기한 만료 미완료", value: (s) => `${s.expired}건 / 발송 ${s.sent}건` },
    { label: "긴급 도달 후 미제출", value: (s) => `${s.urgentPending}건 / 발송 ${s.sent}건` }, { label: "반복 신고", value: (s) => `${s.repeated}건 / 불만 ${s.issues}건` },
    { label: "소요 시간 중앙값", value: (s) => `${time(s.duration.median)} · 표본 ${s.duration.count}건` },
    { label: "소요 시간 p25 / p75", value: (s) => `${time(s.duration.p25)} / ${time(s.duration.p75)}` },
    { label: "30분 초과", value: (s) => `${s.duration.resumed}건 / 완료 ${s.completed}건` },
  ];
  return <section className="overflow-hidden rounded-xl border border-grayscale-200 bg-white">
    <div className="p-5"><h2 className="font-extrabold">회차별 비교</h2><p className="mt-2 text-xs text-grayscale-600">동일한 최초 발송 기간의 정기 4종 비교입니다. 분포는 회차 필터를 선택해 자세히 볼 수 있습니다.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-left text-sm">
      <caption className="sr-only">정기 회차별 참여, 불만, 관심과 소요 시간</caption>
      <thead className="bg-grayscale-70"><tr><th scope="col" className="px-5 py-3">지표</th>{data.rounds.map((r) => <th key={r.round} scope="col" className="px-4 py-3">{ADMIN_ROUNDS[r.round]}</th>)}</tr></thead>
      <tbody className="divide-y divide-grayscale-100">
        {Object.entries(METRIC_LABELS).map(([key, label]) => <tr key={key}><th scope="row" className="px-5 py-3 font-normal">{label}</th>{data.rounds.map((r) => <td key={r.round} className="px-4 py-3"><RatioValue ratio={r.summary.metrics[key as MetricKey]} /></td>)}</tr>)}
        {counts.map((row) => <tr key={row.label}><th scope="row" className="px-5 py-3 font-normal">{row.label}</th>{data.rounds.map((r) => <td key={r.round} className="px-4 py-3 text-xs tabular-nums">{row.value(r.summary)}</td>)}</tr>)}
      </tbody>
    </table></div>
  </section>;
}
export function AdminStatsDashboard({ data }: { data: StatsPageData }) {
  const summary = data.summary;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-primary-600">정기 체크인</p><h1 className="mt-1 text-2xl font-extrabold">통계</h1></div><p className="text-xs text-grayscale-600">조회 시각 {formatAdminTime(data.now)}</p></header>
    <form action="/admin/stats" method="get" aria-label="통계 필터" className="grid gap-4 rounded-xl border border-grayscale-200 bg-white p-4 sm:grid-cols-4">
      <label className="text-xs font-bold text-grayscale-600">회차<select aria-label="회차" name="round" defaultValue={data.filters.round} className="mt-1 w-full rounded-lg border border-grayscale-300 px-3 py-2 text-sm"><option value="all">전체 회차</option>{Object.entries(ADMIN_ROUNDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="min-w-0 text-xs font-bold text-grayscale-600">최초 발송 시작일<input required name="from" type="date" defaultValue={data.filters.from} className="mt-1 w-full rounded-lg border border-grayscale-300 px-3 py-2 text-sm" /></label>
      <label className="min-w-0 text-xs font-bold text-grayscale-600">최초 발송 종료일<input required name="to" type="date" defaultValue={data.filters.to} className="mt-1 w-full rounded-lg border border-grayscale-300 px-3 py-2 text-sm" /></label>
      <button type="submit" className="self-end rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white">통계 조회</button>
    </form>
    <div className="space-y-2 rounded-xl bg-primary-50 px-5 py-4 text-sm leading-6 text-grayscale-700">
      <p><strong>최초 발송일 기준</strong>으로 대상을 묶고, 이후 응답은 조회 시각까지 반영합니다. 분모 10 미만은 건수만, 분모 0은 계산 불가로 표시합니다.</p>
      <p>발송 {summary.sent}건 · 진입 기록 {summary.visited}건 · 완료 {summary.completed}건 · 불만 항목 {summary.issues}건</p>
      {!summary.sent ? <p className="font-bold">선택한 기간·회차에 발송 기준 데이터가 없습니다.</p> : null}
      {data.withoutDeliveryResponses ? <p>선택 기간에 접수됐지만 최초 발송 기록이 없는 완료 {data.withoutDeliveryResponses}건은 참여 통계에서 제외했습니다.</p> : null}
      {data.missingDeliveryTimes ? <p>선택 회차의 발송 성공 기록 중 발송 시각이 없는 세션 {data.missingDeliveryTimes}건이 있습니다. 기간을 추정하지 않습니다.</p> : null}
      {summary.unsupported ? <p>선택 항목을 해석할 수 없는 완료 {summary.unsupported}건은 초기 긍정·자유어 경로 분석에서 제외했습니다.</p> : null}
    </div>
    <section aria-label="주요 통계" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(METRIC_LABELS).map(([key, label]) => <article key={key} aria-label={label} className="rounded-xl border border-grayscale-200 bg-white p-5">
        <h2 className="text-sm font-bold text-grayscale-700">{label}</h2><p className="mt-3 text-2xl font-extrabold"><RatioValue ratio={summary.metrics[key as MetricKey]} /></p><p className="mt-3 text-xs leading-5 text-grayscale-600">{descriptions[key as MetricKey]}</p>
      </article>)}
    </section>
    <section aria-label="미완료 및 반복 신고" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["진행 중 미완료", summary.pending, `발송 ${summary.sent}건 중`], ["기한 만료 미완료", summary.expired, `발송 ${summary.sent}건 중`],
        ["긴급 도달 후 미제출", summary.urgentPending, `발송 ${summary.sent}건 중`], ["진행 기록 없는 완료", summary.completedWithoutProgress, `완료 ${summary.completed}건 중`],
        ["반복 신고", summary.repeated, `불만 항목 ${summary.issues}건 중`],
      ].map(([label, value, base]) => <article key={label} className="rounded-xl border border-grayscale-200 bg-white p-4"><h2 className="text-xs font-bold text-grayscale-600">{label}</h2><p className="mt-2 text-xl font-extrabold">{value}건</p><p className="mt-2 text-xs text-grayscale-500">{base}</p></article>)}
    </section>
    <p className="text-xs leading-5 text-grayscale-600">미응답은 불만 없음으로 간주하지 않습니다. 반복 신고는 같은 고객·태그의 두 번째 이후 불만이며, 해결 여부를 의미하지 않습니다. 리마인더 후 응답률은 발송의 인과 효과를 뜻하지 않습니다.</p>
    <div className="grid gap-4 lg:grid-cols-2">
      <Bars title="단계 도달 기록" description="각 단계에 한 번 이상 도달한 세션 / 발송 세션. 분기·생략이 있어 단계 차이를 이탈 인원으로 해석하지 않습니다." rows={summary.stages} />
      <Bars title="미완료 세션의 마지막 기록" description="진행 기록이 있는 미완료 세션 중 마지막으로 저장된 질문입니다. 확정 이탈 지점이 아니며, 기록 지연·누락이 있을 수 있습니다." rows={summary.lastSteps} />
      <Bars title="불만 태그 분포" description="태그별 불만 수 / 전체 불만 수. 한 응답에 여러 불만이 있을 수 있습니다." rows={summary.tags} />
      <Bars title="태그별 세부 항목" description="선택한 세부 항목별 불만 수 / 해당 태그의 전체 불만 수." rows={summary.chips} />
      <Bars title="커뮤니티 관심 주제" description="해당 주제 선택자 / 주제 제출자. 다중선택이므로 비율의 합계가 전체를 초과할 수 있습니다." rows={summary.topics} />
      <section aria-label="소요 시간" className="rounded-xl border border-grayscale-200 bg-white p-5">
        <h2 className="font-extrabold">소요 시간</h2><p className="mt-2 text-xs leading-5 text-grayscale-600">첫 도달 기록부터 제출까지 30분 이하의 유효한 기록을 집계합니다. 실제 화면에 머문 시간과 다를 수 있습니다.</p>
        <p className="mt-5 text-sm text-grayscale-600">중앙값</p><p className="mt-1 text-3xl font-extrabold">{time(summary.duration.median)}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><dt>p25</dt><dd>{time(summary.duration.p25)}</dd><dt>p75</dt><dd>{time(summary.duration.p75)}</dd><dt>집계 표본</dt><dd>{summary.duration.count}/{summary.completed}건</dd><dt>30분 초과</dt><dd>{summary.duration.resumed}/{summary.completed}건</dd><dt>시간 계산 제외</dt><dd>{summary.duration.missing}/{summary.completed}건</dd></dl>
      </section>
    </div>
    <Comparison data={data} />
  </div>;
}
