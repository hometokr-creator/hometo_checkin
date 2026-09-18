import { AdminLoginForm } from "@/features/admin-auth/login-form";

export function AdminLoginPage({ linkError }: { linkError: boolean }) {
  return <main className="grid min-h-screen place-items-center bg-grayscale-70 p-6">
    <section className="w-full max-w-md rounded-2xl border border-grayscale-200 bg-white p-8">
      <p className="text-sm font-bold text-primary-600">홈투게더</p>
      <h1 className="mt-3 text-2xl font-extrabold">정기 체크인 운영자 로그인</h1>
      <p className="mt-3 text-sm leading-6 text-grayscale-600">이메일로 받은 링크를 눌러 로그인해 주세요.</p>
      <AdminLoginForm linkError={linkError} />
    </section>
  </main>;
}
