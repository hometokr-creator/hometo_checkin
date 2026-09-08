import type { NextRequest } from "next/server";
import { adminProxy } from "@/server/admin/proxy";

export function proxy(request: NextRequest) { return adminProxy(request); }
export const config = { matcher: ["/admin/:path*"] };
