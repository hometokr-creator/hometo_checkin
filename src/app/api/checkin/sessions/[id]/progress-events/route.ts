import { body, json, failure } from "@/server/checkin/http";
import { recordProgress } from "@/server/checkin/record-events";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return json(await recordProgress(id, await body(request, 2048)));
  } catch (error) {
    return failure(error);
  }
}
