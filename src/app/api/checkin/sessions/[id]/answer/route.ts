import { body, json, failure } from "@/server/checkin/http";
import { submitResponse } from "@/server/checkin/submit-response";
export const runtime="nodejs";
export async function POST(request: Request,context:{params:Promise<{id:string}>}) {
 try {const {id}=await context.params;const input=await body(request);return json(await submitResponse(id,input));}catch(error){return failure(error);}
}
