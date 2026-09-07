import { body, json, failure } from "@/server/checkin/http";
import { recordInterest } from "@/server/checkin/record-events";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return json(await recordInterest(id, await body(request, 2048)));
  } catch (error) {
    return failure(error);
  }
}
