import { requireAdmin } from "@/server/admin/session";

export async function AdminPendingPage({ title }: { title: string }) {
  await requireAdmin();
  return <section className="rounded-xl border border-grayscale-200 bg-white p-8">
    <h1 className="text-2xl font-extrabold">{title}</h1>
    <p className="mt-3 text-grayscale-600">운영자 인증이 완료되었습니다. 이 화면은 다음 개발 단계에서 연결합니다.</p>
  </section>;
}
