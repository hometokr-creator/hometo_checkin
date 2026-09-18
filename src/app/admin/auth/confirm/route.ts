import type { NextRequest } from "next/server";
import { confirmAdmin } from "@/server/admin/confirm";
export async function GET(request: NextRequest) { return confirmAdmin(request); }
