import "server-only";

type Env = Record<string, string | undefined>;
const BASE = "https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/";
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
async function get(path: string, env: Env, transport: typeof fetch) {
  if (!env.NHN_ALIMTALK_APP_KEY?.trim() || !env.NHN_ALIMTALK_SECRET_KEY?.trim()) return null;
  try {
    const r = await transport(BASE + encodeURIComponent(env.NHN_ALIMTALK_APP_KEY.trim()) + path, {
      headers: { "X-Secret-Key": env.NHN_ALIMTALK_SECRET_KEY.trim() },
      signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
    });
    if (!r.ok) return null;
    const body = object(await r.json());
    return object(body.header).isSuccessful === true ? body : null;
  } catch { return null; }
}
/** Only the actual NHN approval, non-blocked profile template and expected link can pass. */
export async function nhnTemplateReady(code: string, env: Env = process.env, transport: typeof fetch = fetch) {
  if (!env.NHN_ALIMTALK_SENDER_KEY?.trim() || !env.CHECKIN_APP_ORIGIN) return false;
  let origin: string;
  try {
    const url = new URL(env.CHECKIN_APP_ORIGIN);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    origin = url.origin;
  } catch { return false; }
  const body = await get("/senders/" + encodeURIComponent(env.NHN_ALIMTALK_SENDER_KEY.trim()) +
    "/templates/" + encodeURIComponent(code), env, transport);
  // The live v2.3 response uses singular "template", unlike an older documentation example.
  const t = object(body?.template);
  if (t.templateCode !== code || t.senderKey !== env.NHN_ALIMTALK_SENDER_KEY.trim() ||
    t.status !== "TSC03" || t.block !== false || t.dormant !== false) return false;
  const variables = [...String(t.templateContent ?? "").matchAll(/#\{([^}]+)\}/g)].map(m => m[1]);
  if (!variables.includes("name") || variables.some(v => v !== "name")) return false;
  if (!Array.isArray(t.buttons) || t.buttons.length !== 1) return false;
  const b = object(t.buttons[0]);
  return b.type === "WL" && b.linkMo === origin + "/c/#{token}" && b.linkPc === origin + "/c/#{token}";
}
export type NhnDeliveryResult =
  | { state: "sent"; receivedAt: string }
  | { state: "failed" | "cancelled" | "pending" | "unknown" };
/** NHN date/time strings are interpreted explicitly in Korea, never the host timezone. */
export function parseNhnTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(value.replace(" ", "T") + "+09:00");
  if (!Number.isFinite(parsed.getTime())) return null;
  if (new Date(parsed.getTime() + 9 * 3600000).toISOString().slice(0, 19) !== value.replace(" ", "T")) return null;
  return parsed.toISOString();
}
export async function nhnDeliveryResult(requestId: string, seq: number,
  env: Env = process.env, transport: typeof fetch = fetch): Promise<NhnDeliveryResult> {
  if (!requestId || !Number.isInteger(seq) || seq < 0) return { state: "unknown" };
  const body = await get("/messages/" + encodeURIComponent(requestId) + "/" + seq, env, transport);
  const m = object(body?.message);
  if (m.requestId !== requestId || m.recipientSeq !== seq) return { state: "unknown" };
  if (m.messageStatus === "COMPLETED") {
    const receivedAt = parseNhnTime(m.receiveDate);
    return receivedAt ? { state: "sent", receivedAt } : { state: "unknown" };
  }
  if (m.messageStatus === "FAILED") return { state: "failed" };
  if (m.messageStatus === "CANCEL") return { state: "cancelled" };
  return { state: typeof m.messageStatus === "string" && m.messageStatus ? "pending" : "unknown" };
}
