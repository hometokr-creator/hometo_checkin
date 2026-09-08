import { ADMIN_ROUNDS, ADMIN_TAGS, ADMIN_OUTCOMES, formatAdminTime, isUrgentResponse, type AdminResponse, type ReviewAction } from "@/domains/admin-responses/model";
import { ReviewControl } from "@/features/review-response/review-control";
import { ResponseTimeline } from "./response-timeline";

export function ResponseDetail({ response, history, reviewAction, onSelect }: {
  response: AdminResponse; history: AdminResponse[]; reviewAction: ReviewAction; onSelect: (id: string) => void;
}) {
  const person = response.participant;
  return <article aria-label="응답 상세" className="min-w-0 divide-y divide-grayscale-200">
    <header className="space-y-3 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold">{person.name}님의 응답</h2>
        {isUrgentResponse(response) ? <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">긴급</span> : null}
      </div>
      <p className="text-sm text-grayscale-600">{person.property || "매물 정보 없음"} · {ADMIN_ROUNDS[response.round]}</p>
      {response.initiallyPositive && response.outcome !== "ok" ? <p className="inline-block rounded-md bg-primary-50 px-3 py-2 text-sm font-bold text-primary-600">처음엔 괜찮다고 함</p> : null}
    </header>
    <section className="space-y-4 p-6" aria-labelledby="issue-heading">
      <h3 id="issue-heading" className="font-extrabold">불만 내용 <span className="ml-1 font-normal text-grayscale-500">{response.issues.length}건</span></h3>
      {!response.labelsAvailable ? <p className="text-sm text-grayscale-600">일부 선택 항목을 해석할 수 없습니다. 남겨주신 원문을 확인해 주세요.</p> : null}
      {response.issues.length ? response.issues.map((issue) => <section key={issue.id} aria-label={`${ADMIN_TAGS[issue.tag]} 불만`} className={`rounded-lg border p-4 ${issue.tag === "urgent" ? "border-red-200 bg-red-50/40" : "border-grayscale-200 bg-grayscale-50"}`}>
        <h4 className="font-bold">{ADMIN_TAGS[issue.tag]}{issue.detailLabel ? <span className="ml-2 font-normal text-grayscale-600">· {issue.detailLabel}</span> : null}</h4>
        <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-7 ${issue.freeText?.trim() ? "text-grayscale-900" : "text-grayscale-600"}`}>{issue.freeText?.trim() ? issue.freeText : "설명 없이 태그만 선택함"}</p>
      </section>) : <p className="rounded-lg bg-grayscale-70 p-4 text-sm text-grayscale-600">불만 없이 응답을 마쳤습니다.</p>}
    </section>
    <section className="p-6" aria-labelledby="participant-heading">
      <h3 id="participant-heading" className="mb-4 font-extrabold">참여자 정보</h3>
      <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-grayscale-600">이름</dt><dd>{person.name}</dd>
        <dt className="text-grayscale-600">전화번호</dt><dd>{person.phone}</dd>
        <dt className="text-grayscale-600">매물</dt><dd className="break-words">{person.property || "등록된 정보 없음"}</dd>
        <dt className="text-grayscale-600">집주인</dt><dd>{person.host || "등록된 정보 없음"}</dd>
        <dt className="text-grayscale-600">계약 기간</dt><dd>{person.contractStart} ~ {person.contractEnd}</dd>
      </dl>
    </section>
    <section className="p-6">
      <h3 className="mb-3 font-extrabold">제출 정보</h3>
      <p className="text-sm text-grayscale-700">{formatAdminTime(response.submittedAt)} · {ADMIN_ROUNDS[response.round]} · {ADMIN_OUTCOMES[response.outcome]}</p>
    </section>
    <ResponseTimeline response={response} />
    <section className="space-y-3 p-6">
      <h3 className="font-extrabold">커뮤니티 관심</h3>
      <p className="text-sm text-grayscale-700">{!response.interest?.exposed ? "관심 카드 노출 기록 없음" : response.interest.clicked ? "관심을 표시함" : "관심을 표시하지 않음"}</p>
      <p className="text-sm text-grayscale-600">{response.interest?.topicsSubmitted ? (response.interest.topics.length ? response.interest.topics.join(" · ") : "주제를 선택하지 않고 제출함") : "주제 제출 기록 없음"}</p>
    </section>
    <section className="p-6" aria-labelledby="history-heading">
      <h3 id="history-heading" className="mb-3 font-extrabold">과거 응답 이력 <span className="font-normal text-grayscale-500">{history.length}건</span></h3>
      <p className="mb-3 text-xs text-grayscale-500">이 응답보다 먼저 접수된 기록입니다. 같은 태그가 반복되어도 해결 여부를 뜻하지 않습니다.</p>
      {history.length ? <ul className="divide-y divide-grayscale-100">{history.map((item) => <li key={item.id}>
        <button onClick={() => onSelect(item.id)} className="w-full rounded py-3 text-left text-sm hover:bg-grayscale-70 focus-visible:outline-primary-500">
          <span className="block font-bold">{ADMIN_ROUNDS[item.round]} · {formatAdminTime(item.submittedAt)}</span>
          <span className="mt-1 block text-grayscale-600">{item.issues.length ? item.issues.map((issue) => ADMIN_TAGS[issue.tag]).join(" · ") : "불만 없음"}</span>
          <span className="mt-1 line-clamp-2 text-grayscale-700">{item.issues.map((issue) => issue.freeText || "설명 없이 태그만 선택함").join(" / ")}</span>
        </button>
      </li>)}</ul> : <p className="text-sm text-grayscale-600">이전 응답이 없습니다.</p>}
    </section>
    <section className="p-6">
      <h3 className="mb-4 font-extrabold">확인 상태</h3>
      <ReviewControl key={response.id} id={response.id} reviewedAt={response.reviewedAt} action={reviewAction} />
    </section>
  </article>;
}
