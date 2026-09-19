import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { queryNhnAlimtalk, sendNhnTestAlimtalk } from "./nhn-alimtalk";

const env = { NHN_ALIMTALK_APP_KEY: "fake-app", NHN_ALIMTALK_SECRET_KEY: "fake-secret",
  NHN_ALIMTALK_SENDER_KEY: "s".repeat(40), NHN_ALIMTALK_TEST_SEND_ENABLED: "true",
  NHN_ALIMTALK_TEST_RECIPIENTS: "010-0000-0000", NHN_ALIMTALK_APPROVED_TEMPLATE_CODES: "test_template" };
const input = { recipientNo: "01000000000", templateCode: "test_template",
  templateParameter: { name: "가상 고객", token: "fake-token" }, attemptId: "fake-attempt-00001" };
const success = { header: { isSuccessful: true }, message: {
  requestId: "request-1", sendResults: [{ recipientSeq: 1, resultCode: 0 }] } };
const mock = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("NHN test-only provider adapter", () => {
  it("blocks disabled sending before network access", async () => {
    const fetcher = mock(success);
    await expect(sendNhnTestAlimtalk(input, { ...env, NHN_ALIMTALK_TEST_SEND_ENABLED: "false" }, fetcher)).rejects.toThrow("NHN_SEND_DISABLED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("blocks recipients and unapproved templates", async () => {
    const fetcher = mock(success);
    await expect(sendNhnTestAlimtalk({ ...input, recipientNo: "01011111111" }, env, fetcher)).rejects.toThrow("NHN_RECIPIENT_NOT_ALLOWED");
    await expect(sendNhnTestAlimtalk({ ...input, templateCode: "unapproved" }, env, fetcher)).rejects.toThrow("NHN_TEMPLATE_NOT_APPROVED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends one recipient with duplicate key and SMS fallback disabled; returns acceptance only", async () => {
    const fetcher = mock(success);
    expect(await sendNhnTestAlimtalk(input, env, fetcher)).toEqual({ state: "accepted", requestId: "request-1", recipientSeq: 1 });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/fake-app/messages");
    expect(options?.headers).toMatchObject({ "X-NC-API-IDEMPOTENCY-KEY": input.attemptId });
    expect(options?.redirect).toBe("error");
    expect(JSON.parse(options?.body as string).recipientList).toEqual([{ recipientNo: input.recipientNo,
      templateParameter: input.templateParameter, recipientGroupingKey: input.attemptId, resendParameter: { isResend: false } }]);
  });
  it.each([
    { header: { isSuccessful: false, resultCode: -1000, resultMessage: "private value" } },
    { ...success, message: { sendResults: [{ resultCode: -1000 }] } },
  ])("keeps provider rejection codes without private response text", async body => {
    expect(await sendNhnTestAlimtalk(input, env, mock(body))).toEqual({ state: "rejected", code: -1000 });
  });
  it.each([{}, { header: { isSuccessful: true } }, { ...success, message: { ...success.message, sendResults: [] } },
    { ...success, message: { ...success.message, sendResults: [{ resultCode: 0, recipientSeq: 1, recipientNo: "01011111111" }] } },
  ])("does not infer acceptance from malformed or mismatched responses", async body => {
    expect(await sendNhnTestAlimtalk(input, env, mock(body))).toEqual({ state: "unknown" });
  });
  it("never retries a timeout or HTTP error", async () => {
    for (const fetcher of [vi.fn<typeof fetch>().mockRejectedValue(new Error("private token")), mock({}, 503)]) {
      expect(await sendNhnTestAlimtalk(input, env, fetcher)).toEqual({ state: "unknown" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each([["COMPLETED", "sent"], ["FAILED", "failed"], ["CANCEL", "cancelled"], ["READY", "pending"]])(
    "reads provider status %s separately", async (messageStatus, expected) => {
      const fetcher = mock({ header: { isSuccessful: true }, message: { requestId: "request-1", recipientSeq: 1, messageStatus } });
      expect(await queryNhnAlimtalk("request-1", 1, env, fetcher)).toBe(expected);
    });
  it("rejects an unrelated result reference", async () => {
    expect(await queryNhnAlimtalk("request-1", 1, env, mock({ header: { isSuccessful: true },
      message: { requestId: "another", recipientSeq: 1, messageStatus: "COMPLETED" } }))).toBe("unknown");
  });
});
