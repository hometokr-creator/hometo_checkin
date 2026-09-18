import { CheckinPage } from "@/pages-layer/checkin";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function Page({ params }: PageProps) {
  const { token } = await params;
  return <CheckinPage token={token} />;
}
