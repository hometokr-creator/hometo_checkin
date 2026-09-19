import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db";
import { dispatchMode, dispatchDue, ROUND_TEMPLATES } from "./dispatch-policy";
import { nhnDeliveryResult, nhnTemplateReady } from "./nhn-readiness";
import { sendNhnScheduledAlimtalk } from "./nhn-alimtalk";

type Env = Record<string, string | undefined>;
/** Bounded execution. Repeated calls reconcile accepted requests, never resend uncertain ones. */
export async function runCheckinDispatch(env: Env = process.env) {
  const mode = dispatchMode(env);
  const counts = { mode, candidates: 0, accepted: 0, held: 0, reconciled: 0, unknown: 0 };
  if (mode === "disabled") return counts;
  const db = getDb();
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await db.rpc(name, args);
    if (result.error) throw new Error("DISPATCH_DATABASE_ERROR");
    return result.data;
  };
  if (mode === "test" || mode === "live") {
    await rpc("maintain_checkin_dispatch");
    const { data, error } = await db.from("checkin_dispatch_attempt")
      .select("id,request_id,recipient_seq").eq("state", "accepted").order("updated_at").limit(3);
    if (error) throw new Error("DISPATCH_DATABASE_ERROR");
    for (const attempt of data ?? []) {
      const result = await nhnDeliveryResult(attempt.request_id, attempt.recipient_seq, env);
      await rpc("record_checkin_dispatch_delivery", {
        p_attempt_id: attempt.id, p_request_id: attempt.request_id, p_recipient_seq: attempt.recipient_seq,
        p_outcome: result.state, p_received_at: result.state === "sent" ? result.receivedAt : null,
      });
      if (result.state === "sent") counts.reconciled++;
    }
  }
  const { data: candidates, error } = await db.rpc("checkin_dispatch_candidates").limit(1000);
  if (error) throw new Error("DISPATCH_DATABASE_ERROR");
  counts.candidates = candidates?.length ?? 0;
  if (mode === "dry-run") return counts;
  const allowed = (env.NHN_ALIMTALK_TEST_RECIPIENTS ?? "").split(",").map(v => v.replace(/[ -]/g, ""));
  const approved = (env.NHN_ALIMTALK_APPROVED_TEMPLATE_CODES ?? "").split(",").map(v => v.trim());
  const ready = new Map<string, boolean>();
  let attempted = 0;
  for (const candidate of candidates ?? []) {
    if (attempted >= 3) break;
    if (!dispatchDue(candidate.scheduled_on, new Date())) continue;
    const code = ROUND_TEMPLATES[candidate.round_type];
    if (!code || !candidate.display_name || (mode === "test" && !allowed.includes(candidate.phone?.replace(/[ -]/g, ""))) || !approved.includes(code)) {
      counts.held++; continue;
    }
    if (!ready.has(code)) ready.set(code, await nhnTemplateReady(code, env));
    if (!ready.get(code)) { counts.held++; continue; }
    const token = randomBytes(32).toString("base64url");
    const claim = await rpc("claim_checkin_dispatch", {
      p_schedule_id: candidate.schedule_id, p_expected_updated_at: candidate.guest_updated_at,
      p_template_code: code, p_token_digest: createHash("sha256").update(token).digest("hex"),
    });
    if (!claim) continue;
    attempted++;
    // Once claimed, even an ambiguous network failure is never automatically retried.
    let outcome;
    try {
      outcome = await sendNhnScheduledAlimtalk({
        recipientNo: claim.phone, templateCode: code, templateParameter: { name: claim.name, token },
        attemptId: claim.attemptId,
      }, env);
    } catch { outcome = { state: "unknown" as const }; }
    await rpc("record_checkin_dispatch_request", {
      p_attempt_id: claim.attemptId, p_outcome: outcome.state,
      p_request_id: outcome.state === "accepted" ? outcome.requestId : null,
      p_recipient_seq: outcome.state === "accepted" ? outcome.recipientSeq : null,
    });
    if (outcome.state === "accepted") counts.accepted++;
    if (outcome.state === "unknown") counts.unknown++;
  }
  return counts;
}
