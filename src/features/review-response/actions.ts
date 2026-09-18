"use server";
import { revalidatePath } from "next/cache";
import { reviewAdminResponse } from "@/server/admin/review-response";
import type { ReviewResult } from "@/domains/admin-responses/model";

export async function setResponseReviewed(id: string, reviewed: boolean): Promise<ReviewResult> {
  const result = await reviewAdminResponse(id, reviewed);
  if (result.ok) revalidatePath("/admin/responses");
  return result;
}
