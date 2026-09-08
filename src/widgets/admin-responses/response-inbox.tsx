"use client";
import { useState } from "react";
import { ADMIN_ROUNDS, ADMIN_TAGS, filterResponses, formatAdminTime, initialFilters, isUrgentResponse, koreanDate, previousResponses, responseSummary, validDate, type AdminInboxData, type ResponseFilters, type ReviewAction } from "@/domains/admin-responses/model";
import { ResponseDetail } from "./response-detail";

const controlClass = "mt-1 w-full rounded-lg border border-grayscale-300 bg-white px-3 py-2 text-sm focus-visible:outline-primary-500";
export function ResponseInbox({ data, reviewAction }: { data: AdminInboxData; reviewAction: ReviewAction }) {
  const [filters, setFilters] = useState(() => initialFilters(data.now));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  function filter<K extends keyof ResponseFilters>(key: K, value: ResponseFilters[K]) {
    setFilters((previous) => ({ ...previous, [key]: value })); setSelectedId(null);
  }
  const invalidPeriod = (filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to);
  const visible = filterResponses(data.responses, filters);
  const summary = responseSummary(visible);
  const selected = data.responses.find((r) => r.id === selectedId);
  const defaults = initialFilters(data.now);
  const period = filters.from === defaults.from && filters.to === defaults.to ? "최근 30일" : `${filters.from || "전체"} ~ ${filters.to || "전체"}`;
  const pending = invalidPeriod ? [] : data.urgentPending.filter((item) => {
    const day = koreanDate(item.reachedAt);
    return (filters.round === "all" || item.round === filters.round) && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  });
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold tracking-wide text-primary-600">정기 체크인</p><h1 className="mt-1 text-2xl font-extrabold">응답</h1></div>
      <p aria-label="응답 요약" className="text-sm text-grayscale-600">{period} · 응답 <strong className="text-grayscale-900">{summary.total}건</strong> · 불만 {summary.reported}건 · <span className={summary.urgent ? "font-bold text-red-700" : ""}>긴급 {summary.urgent}건</span></p>
    </header>
    <details className="rounded-xl border border-grayscale-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold">필터 · {filters.round === "all" ? "전체 회차" : ADMIN_ROUNDS[filters.round]} · {filters.complaint === "all" ? "전체 응답" : filters.complaint === "yes" ? "불만 있음" : "불만 없음"} · {filters.review === "all" ? "전체 확인 상태" : filters.review === "unreviewed" ? "미확인" : "확인함"}</summary>
      <section aria-label="응답 필터" className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <label className="text-xs font-bold text-grayscale-600">회차<select className={controlClass} value={filters.round} onChange={(event) => filter("round", event.target.value as ResponseFilters["round"])}><option value="all">전체 회차</option>{Object.entries(ADMIN_ROUNDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-bold text-grayscale-600">불만 유무<select className={controlClass} value={filters.complaint} onChange={(event) => filter("complaint", event.target.value as ResponseFilters["complaint"])}><option value="all">전체 응답</option><option value="yes">불만 있음</option><option value="no">불만 없음</option></select></label>
      <label className="text-xs font-bold text-grayscale-600">확인 여부<select className={controlClass} value={filters.review} onChange={(event) => filter("review", event.target.value as ResponseFilters["review"])}><option value="all">전체</option><option value="unreviewed">미확인</option><option value="reviewed">확인함</option></select></label>
      <label className="min-w-0 text-xs font-bold text-grayscale-600">접수 시작일<input className={controlClass} type="date" value={filters.from} onChange={(event) => filter("from", event.target.value)} /></label>
      <label className="min-w-0 text-xs font-bold text-grayscale-600">접수 종료일<input className={controlClass} type="date" value={filters.to} onChange={(event) => filter("to", event.target.value)} /></label>
      <button onClick={() => { setFilters(initialFilters(data.now)); setSelectedId(null); }} className="self-end rounded-lg border border-grayscale-300 px-3 py-2 text-sm hover:bg-grayscale-70">필터 초기화</button>
    </section>
    </details>
    {invalidPeriod ? <p role="alert" className="text-sm text-red-700">시작일과 종료일을 확인해 주세요.</p> : null}
    {pending.length ? <section aria-label="긴급 경로 진입 미제출" className="rounded-xl border border-red-200 bg-white p-4">
      <h2 className="font-bold text-red-800">긴급 경로 진입 · 미제출 <span className="ml-1">{pending.length}건</span></h2>
      <p className="mt-1 text-xs text-grayscale-600">확정 신고와 별도인 진행 기록입니다. 선택한 기간·회차 기준이며 불만·확인 필터는 적용하지 않습니다.</p>
      {pending.length ? <ul className="mt-3 divide-y divide-red-100">{pending.map((item) => <li key={item.sessionId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
        <strong>{item.name}</strong><span>{item.property || "매물 정보 없음"}</span><span className="text-grayscale-600">{ADMIN_ROUNDS[item.round]} · {formatAdminTime(item.reachedAt)}</span>
        <span className="ml-auto text-xs font-bold text-red-700">{Date.parse(item.expiresAt) <= Date.parse(data.now) ? "기한 만료 · 미완료" : "진행 중 · 미완료"}</span>
      </li>)}</ul> : <p className="mt-3 text-sm text-grayscale-600">해당하는 기록이 없습니다.</p>}
    </section> : null}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.3fr)]">
      <section aria-label="응답 목록" className="min-w-0 overflow-hidden rounded-xl border border-grayscale-200 bg-white">
        <div className="border-b border-grayscale-200 px-4 py-3 text-xs text-grayscale-600">응답 {visible.length}건 · 긴급, 불만, 최신순</div>
        {visible.length ? <ul className="divide-y divide-grayscale-100">{visible.map((item) => <li key={item.id}>
          <button aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={`w-full border-l-4 px-4 py-4 text-left outline-offset-[-3px] focus-visible:outline-primary-500 ${selectedId === item.id ? "border-primary-500 bg-primary-50" : "border-transparent hover:bg-grayscale-70"} ${item.reviewedAt ? "text-grayscale-600" : "font-bold text-grayscale-900"}`}>
            <span className="flex flex-wrap items-center gap-2"><span aria-label={item.reviewedAt ? "확인함" : "미확인"} className={`text-[10px] ${item.reviewedAt ? "text-transparent" : "text-primary-500"}`}>●</span>
              {isUrgentResponse(item) ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">긴급</span> : null}
              <span>{item.participant.name}</span><span className="truncate text-xs font-normal text-grayscale-600">{item.participant.property || "매물 정보 없음"}</span>
            </span>
            <span className="mt-2 block text-xs">{item.issues.length ? item.issues.map((issue) => ADMIN_TAGS[issue.tag]).join(" · ") : "불만 없음"}</span>
            <span className="mt-2 line-clamp-1 break-all text-sm font-normal text-grayscale-600">{item.issues.length ? item.issues.map((issue) => issue.freeText?.trim() ? issue.freeText : "설명 없이 태그만 선택함").join(" / ") : "불만 없이 응답을 마쳤습니다."}</span>
            <span className="mt-3 block text-xs font-normal text-grayscale-500">{ADMIN_ROUNDS[item.round]} · {formatAdminTime(item.submittedAt)}</span>
          </button>
        </li>)}</ul> : <p className="p-8 text-sm leading-6 text-grayscale-600">{data.responses.length ? "선택한 조건에 맞는 응답이 없습니다." : "아직 접수된 정기 체크인 응답이 없습니다."}</p>}
      </section>
      <section className="min-w-0 rounded-xl border border-grayscale-200 bg-white">
        {selected ? <>
          {!visible.some((item) => item.id === selected.id) ? <p className="border-b border-grayscale-200 px-6 py-3 text-xs text-grayscale-600">현재 목록 필터 밖의 응답을 보고 있습니다.</p> : null}
          <ResponseDetail key={selected.id} response={selected} history={previousResponses(data.responses, selected)} reviewAction={reviewAction} onSelect={setSelectedId} />
        </> : <div className="grid min-h-80 place-content-center p-8 text-center"><h2 className="font-bold">응답을 선택해 주세요</h2><p className="mt-2 text-sm leading-6 text-grayscale-600">목록을 누르면 여기에서 내용을 확인할 수 있습니다.<br />확인 상태는 버튼을 눌러 직접 변경합니다.</p></div>}
      </section>
    </div>
  </div>;
}
