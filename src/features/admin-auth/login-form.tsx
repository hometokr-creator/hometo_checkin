"use client";
import { useActionState } from "react";
import { requestAdminLogin } from "./actions";

export function AdminLoginForm({ linkError }: { linkError: boolean }) {
  const [message, action, pending] = useActionState(requestAdminLogin, "");
  return <form action={action} className="mt-8 space-y-5">
    <div>
      <label htmlFor="admin-email" className="mb-2 block text-sm font-bold">운영자 이메일</label>
      <input id="admin-email" name="email" type="email" autoComplete="email" required maxLength={254} className="w-full rounded-lg border border-grayscale-300 bg-white px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-primary-500" />
    </div>
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-primary-600 px-4 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{pending ? "보내는 중…" : "로그인 링크 받기"}</button>
    <p role="status" aria-live="polite" className="min-h-10 text-sm text-grayscale-700">{message || (linkError ? "로그인 링크가 만료되었거나 유효하지 않습니다. 새 링크를 받아 주세요." : "허용된 운영자 이메일로만 로그인할 수 있습니다.")}</p>
  </form>;
}
