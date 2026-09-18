import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTestDatabase } from "./test-database-policy.mjs";
const production = "https://rfwxpqekweizestlxomi.supabase.co";
test("production is denied even when explicitly configured as the test target", () => {
  assert.throws(() => assertTestDatabase({ SUPABASE_URL: production, CHECKIN_TEST_SUPABASE_URL: production }), /production/);
});
test("missing and mismatched test targets fail closed", () => {
  assert.throws(() => assertTestDatabase({ SUPABASE_URL: "https://test.supabase.co" }));
  assert.throws(() => assertTestDatabase({ SUPABASE_URL: "https://test.supabase.co", CHECKIN_TEST_SUPABASE_URL: "https://other.supabase.co" }));
});
test("dedicated remote and loopback origins work", () => {
  for (const url of ["https://test.supabase.co", "http://127.0.0.1:54321", "http://localhost:54321"])
    assert.doesNotThrow(() => assertTestDatabase({ SUPABASE_URL: url, CHECKIN_TEST_SUPABASE_URL: url }));
});
test("credentials, paths and insecure remote origins are rejected", () => {
  for (const url of ["https://test.supabase.co/path", "http://test.supabase.co", "https://user:secret@test.supabase.co", "file:///tmp/test"])
    assert.throws(() => assertTestDatabase({ SUPABASE_URL: url, CHECKIN_TEST_SUPABASE_URL: url }));
});
