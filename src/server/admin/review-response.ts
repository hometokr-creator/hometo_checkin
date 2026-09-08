import "server-only";
import { getDb } from "../db";
import { requireAdmin } from "./session";
import { uuid } from "../checkin/http";
import { ADMIN_ROUNDS, type ReviewResult } from "@/domains/admin-responses/model";

export async function reviewAdminResponse(id: unknown, reviewed: unknown): Promise<ReviewResult> {
  await requireAdmin();
  try { uuid(id); } catch { return { ok: false, message: "응답을 확인해 주세요." }; }
  if (typeof reviewed !== "boolean") return { ok: false, message: "확인 상태를 확인해 주세요." };
  try {
    const db = getDb();
    const { data, error } = await db.from("checkin_response")
      .select("id,session:checkin_session!inner(round_type,status)").eq("id", id)
      .in("session.round_type", Object.keys(ADMIN_ROUNDS)).neq("session.status", "cancelled").maybeSingle();
    if (error) return { ok: false, message: "응답을 조회하지 못했습니다. 다시 시도해 주세요." };
    if (!data) return { ok: false, message: "확인할 응답을 찾을 수 없습니다." };
    const result = await db.rpc("mark_checkin_response_reviewed", { p_response_id: id, p_reviewed: reviewed });
    if (result.error) return { ok: false, message: "확인 상태를 저장하지 못했습니다. 다시 시도해 주세요." };
    return { ok: true };
  } catch { return { ok: false, message: "확인 상태를 저장하지 못했습니다. 다시 시도해 주세요." }; }
}
