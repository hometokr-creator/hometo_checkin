import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = { title: "홈투게더 체크인 운영", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: ReactNode }) { return children; }
