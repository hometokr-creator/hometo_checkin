import { authorize } from "@/server/checkin/access";
import { json, failure } from "@/server/checkin/http";
export const runtime="nodejs";
export async function GET(request: Request) {
 try {
  const {row,session}=await authorize(new URL(request.url).searchParams.get("sessionId") ?? "");
  if(row.status==="completed") return json({status:"completed",sessionId:session.id});
  if(Date.parse(row.answer_expires_at)<=Date.now()) return json({status:"expired"});
  return json({status:"active",session});
 } catch(error) { return failure(error); }
}
