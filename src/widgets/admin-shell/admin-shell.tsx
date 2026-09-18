import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAdmin } from "@/features/admin-auth/actions";

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-grayscale-70">
    <header className="border-b border-grayscale-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-6 px-6 py-5">
        <span className="font-extrabold">홈투게더 <span className="ml-2 font-normal text-grayscale-600">정기 체크인</span></span>
        <nav aria-label="운영자 메뉴" className="flex gap-5 text-sm font-bold">
          <Link prefetch={false} href="/admin/responses" className="hover:text-primary-600">응답</Link>
        </nav>
        <form action={logoutAdmin} className="ml-auto"><button className="rounded-md border border-grayscale-300 px-3 py-2 text-sm hover:bg-grayscale-70">로그아웃</button></form>
      </div>
    </header>
    <main className="mx-auto max-w-[1440px] p-6">{children}</main>
  </div>;
}
