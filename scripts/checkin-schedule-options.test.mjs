import test from "node:test";
import assert from "node:assert/strict";
import { scheduleOptions, contractResolution } from "./checkin-schedule-options.mjs";
const project = "qgqnktipmmamzowbxcmg";
const args = ["--env=.env.checkin-test", `--expect-project=${project}`];
test("schedule command defaults to preview and requires an explicit matching environment", () => {
  assert.equal(scheduleOptions(args, { SUPABASE_URL: `https://${project}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "fake" }).apply, false);
  assert.throws(() => scheduleOptions([], {}), /EXPLICIT_ENV/);
  assert.throws(() => scheduleOptions(args, { SUPABASE_URL: "https://rfwxpqekweizestlxomi.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake" }), /MISMATCH/);
  assert.throws(() => scheduleOptions([...args, "--env=second"]), /DUPLICATE/);
  assert.throws(() => scheduleOptions([...args, "--prod"]), /UNKNOWN/);
});
test("contract resolution requires explicit apply and bounded identity/date inputs", () => {
  assert.throws(() => scheduleOptions([...args, "--resolution=private.json"]), /REQUIRES_APPLY/);
  const value = { guestUuid: "11111111-1111-4111-8111-111111111111", expectedContractId: "22222222-2222-4222-8222-222222222222",
    expectedStart: "2026-09-01", expectedEnd: "2027-03-01", kind: "correction", private: "not forwarded" };
  assert.equal(contractResolution(value).p_kind, "correction");
  assert.equal(Object.keys(contractResolution(value)).length, 5);
  assert.throws(() => contractResolution({ ...value, expectedEnd: "2027-02-30" }), /INVALID/);
  assert.throws(() => contractResolution({ ...value, kind: "guess" }), /INVALID/);
});
