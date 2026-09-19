import "server-only";
import { dispatchMode } from "./dispatch-policy";

// Provider adapter only. No scheduler, DB writes or automatic retries.
const ENDPOINT = "https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/";
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export type NhnAcceptance =
  | { state: "accepted"; requestId: string; recipientSeq: number }
  | { state: "rejected"; code: number }
  | { state: "unknown" };

function object(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function credentials(env: Env) {
  const appKey = env.NHN_ALIMTALK_APP_KEY?.trim();
  const secretKey = env.NHN_ALIMTALK_SECRET_KEY?.trim();
  if (!appKey || !secretKey || /[\r\n]/.test(appKey + secretKey)) throw new Error("NHN_CREDENTIALS_MISSING");
  return { appKey, secretKey };
}
function phone(value: string): string {
  const normalized = value.replace(/[ -]/g, "");
  if (!/^\d{8,15}$/.test(normalized)) throw new Error("NHN_INVALID_PHONE");
  return normalized;
}

type SendInput = {
  recipientNo: string;
  templateCode: string;
  templateParameter: Record<string, string>;
  attemptId: string;
};
export async function sendNhnTestAlimtalk(input: SendInput, env: Env = process.env, transport: typeof fetch = fetch) {
  return send(input, env, transport, false);
}
export async function sendNhnScheduledAlimtalk(input: SendInput, env: Env = process.env, transport: typeof fetch = fetch) {
  const mode = dispatchMode(env);
  if (mode !== "test" && mode !== "live") throw new Error("NHN_SEND_DISABLED");
  return send(input, env, transport, mode === "live");
}
async function send(input: SendInput, env: Env, transport: typeof fetch, live: boolean): Promise<NhnAcceptance> {
  if (!live && env.NHN_ALIMTALK_TEST_SEND_ENABLED !== "true") throw new Error("NHN_SEND_DISABLED");
  const recipientNo = phone(input.recipientNo);
  const allowed = (env.NHN_ALIMTALK_TEST_RECIPIENTS ?? "").split(",").map(v => v.trim()).filter(Boolean).map(phone);
  if (!live && !allowed.includes(recipientNo)) throw new Error("NHN_RECIPIENT_NOT_ALLOWED");
  const templates = (env.NHN_ALIMTALK_APPROVED_TEMPLATE_CODES ?? "").split(",").map(v => v.trim()).filter(Boolean);
  if (!input.templateCode || input.templateCode.length > 20 || !templates.includes(input.templateCode)) {
    throw new Error("NHN_TEMPLATE_NOT_APPROVED");
  }
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.attemptId)) throw new Error("NHN_INVALID_ATTEMPT_ID");
  if (!input.templateParameter || Array.isArray(input.templateParameter)
    || Object.entries(input.templateParameter).some(([key, value]) => !key || typeof value !== "string" || !value)) {
    throw new Error("NHN_INVALID_PARAMETERS");
  }
  const { appKey, secretKey } = credentials(env);
  const senderKey = env.NHN_ALIMTALK_SENDER_KEY?.trim();
  if (!senderKey || senderKey.length !== 40) throw new Error("NHN_SENDER_KEY_MISSING");
  try {
    const response = await transport(`${ENDPOINT}${encodeURIComponent(appKey)}/messages`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json;charset=UTF-8", "X-Secret-Key": secretKey,
        "X-NC-API-IDEMPOTENCY-KEY": input.attemptId },
      body: JSON.stringify({ senderKey, templateCode: input.templateCode, senderGroupingKey: input.attemptId,
        recipientList: [{ recipientNo, templateParameter: input.templateParameter,
          recipientGroupingKey: input.attemptId, resendParameter: { isResend: false } }] }),
    });
    // A transport failure may occur after acceptance. Never retry it automatically.
    if (!response.ok) return { state: "unknown" };
    const body = object(await response.json());
    const header = object(body.header);
    if (header.isSuccessful === false && Number.isInteger(header.resultCode)) {
      return { state: "rejected", code: header.resultCode as number };
    }
    if (header.isSuccessful !== true) return { state: "unknown" };
    const message = object(body.message);
    if (!Array.isArray(message.sendResults) || message.sendResults.length !== 1) return { state: "unknown" };
    const result = object(message.sendResults[0]);
    if (result.recipientNo !== undefined && result.recipientNo !== recipientNo) return { state: "unknown" };
    if (!Number.isInteger(result.resultCode)) return { state: "unknown" };
    if (result.resultCode !== 0) return { state: "rejected", code: result.resultCode as number };
    if (typeof message.requestId !== "string" || !message.requestId || !Number.isInteger(result.recipientSeq)
      || (result.recipientSeq as number) < 0) return { state: "unknown" };
    return { state: "accepted", requestId: message.requestId, recipientSeq: result.recipientSeq as number };
  } catch {
    // Provider bodies/errors can contain phone numbers, tokens and authentication headers.
    return { state: "unknown" };
  }
}

/** Read-only reconciliation. Request acceptance is never treated as delivery success. */
export async function queryNhnAlimtalk(requestId: string, recipientSeq: number,
  env: Env = process.env, transport: typeof fetch = fetch): Promise<"sent" | "failed" | "cancelled" | "pending" | "unknown"> {
  if (!requestId || !Number.isInteger(recipientSeq) || recipientSeq < 0) throw new Error("NHN_INVALID_REFERENCE");
  const { appKey, secretKey } = credentials(env);
  try {
    const response = await transport(`${ENDPOINT}${encodeURIComponent(appKey)}/messages/${encodeURIComponent(requestId)}/${recipientSeq}`, {
      headers: { "X-Secret-Key": secretKey }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return "unknown";
    const body = object(await response.json());
    const message = object(body.message);
    if (object(body.header).isSuccessful !== true || message.requestId !== requestId || message.recipientSeq !== recipientSeq) return "unknown";
    switch (message.messageStatus) {
      case "COMPLETED": return "sent";
      case "FAILED": return "failed";
      case "CANCEL": return "cancelled";
      default: return typeof message.messageStatus === "string" && message.messageStatus ? "pending" : "unknown";
    }
  } catch { return "unknown"; }
}
