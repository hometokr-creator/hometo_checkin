import { formatElapsed, isUrgentResponse, type AdminResponse } from "@/domains/admin-responses/model";
const clock = (at: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(at));

export function ResponseTimeline({ response }: { response: AdminResponse }) {
  return <section aria-labelledby="timeline-heading" className="space-y-3 p-6">
    <h3 id="timeline-heading" className="font-extrabold">진행 흐름</h3>
    <p className="text-xs leading-5 text-grayscale-600">도달 기록의 서버 저장 시각과 최종 답변입니다. 기록은 누락되거나 늦게 도착할 수 있으며 실제 답변 시각과 다릅니다.</p>
    {response.timeline.length ? <ol className="space-y-4 border-l-2 border-grayscale-200 pl-4">
      {response.timeline.map((item, index) => <li key={index} className="grid gap-1 text-sm sm:grid-cols-[5rem_1fr] sm:gap-x-3">
        <time dateTime={item.at} className="text-xs tabular-nums text-grayscale-500">{clock(item.at)}</time>
        <div><p className="whitespace-pre-line text-xs leading-5 text-grayscale-600">{item.question}</p><p className="mt-1 font-bold">{item.answer}</p></div>
      </li>)}
      <li className="grid gap-1 text-sm sm:grid-cols-[5rem_1fr] sm:gap-x-3">
        <time dateTime={response.submittedAt} className="text-xs tabular-nums text-grayscale-500">{clock(response.submittedAt)}</time>
        <div><p className="font-bold">제출 · 불만 {response.issues.length}건 · {isUrgentResponse(response) ? "긴급" : "긴급 아님"}</p>
          <p className="mt-1 text-xs text-grayscale-600">{response.durationSeconds === null ? "소요 시간 계산 불가" : `기록 기준 총 ${formatElapsed(response.durationSeconds)}${response.durationSeconds > 1800 ? " · 30분 초과" : ""}`}</p></div>
      </li>
    </ol> : <p className="rounded-lg bg-grayscale-70 p-4 text-sm text-grayscale-600">진행 기록 없음</p>}
  </section>;
}
