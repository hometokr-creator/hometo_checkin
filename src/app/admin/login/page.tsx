import { AdminLoginPage } from "@/pages-layer/admin/login-page";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AdminLoginPage linkError={(await searchParams).error === "link"} />;
}
