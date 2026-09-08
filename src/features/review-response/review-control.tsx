"use client";
import { useActionState } from "react";
import { formatAdminTime, type ReviewAction } from "@/domains/admin-responses/model";

export function ReviewControl({ id, reviewedAt, action }: { id: string; reviewedAt: string | null; action: ReviewAction }) {
  const [message, submit, pending] = useActionState(async () => {
    try {
      const result = await action(id, !reviewedAt);
      return result.ok ? (reviewedAt ? "확인을 해제했습니다." : "확인함으로 표시했습니다.") : result.message;
    } catch { return "로그인 상태와 연결을 확인한 뒤 다시 시도해 주세요."; }
  }, "");
  return <form action={submit} className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-grayscale-600">{reviewedAt ? `확인함 ${formatAdminTime(reviewedAt)}` : "아직 확인하지 않은 응답입니다."}</p>
      <button disabled={pending} className="rounded-lg border border-primary-600 px-4 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50 disabled:opacity-50">
        {pending ? "저장 중…" : reviewedAt ? "확인 해제" : "확인함으로 표시"}
      </button>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-grayscale-600">{message}</p>
  </form>;
}
