import { timingSafeEqual } from "node:crypto";
import { runCheckinDispatch } from "@/server/checkin/dispatch";

export const runtime = "nodejs";
export const maxDuration = 180;
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + (secret ?? ""));
  if (!secret || Buffer.byteLength(secret) < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return reply({ error: "UNAUTHORIZED" }, 401);
  }
  try { return reply(await runCheckinDispatch()); }
  catch { return reply({ error: "CHECKIN_DISPATCH_FAILED" }, 503); }
}
