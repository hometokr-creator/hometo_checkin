import { exchangeToken, cookieName } from "@/server/checkin/access";
import { body, keys, json, failure } from "@/server/checkin/http";
import { accessEnvironment } from "@/server/env";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await body(request, 2048);
    keys(input, ["token"]);
    const { grant, value } = await exchangeToken(input.token);
    const response = json({ sessionId: grant.sessionId });
    response.cookies.set(cookieName(grant.sessionId), value, {
      httpOnly: true,
      secure: accessEnvironment().secure,
      sameSite: "lax",
      path: "/api/checkin",
      expires: new Date(grant.exp),
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
