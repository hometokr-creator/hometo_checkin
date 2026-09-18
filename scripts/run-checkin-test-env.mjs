import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { assertTestDatabase } from "./test-database-policy.mjs";

// Explicit file, never fall back to the production-connected .env.local.
const mode = process.argv[2];
if (!["dev", "backend"].includes(mode)) throw new Error("Use dev or backend mode");
let configured;
try {
  configured = parseEnv(await readFile(".env.checkin-test", "utf8"));
} catch {
  throw new Error("Create the private .env.checkin-test file before running tests");
}
for (const name of ["SUPABASE_URL", "CHECKIN_TEST_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CHECKIN_ACCESS_SECRET", "CHECKIN_APP_ORIGIN", "SUPABASE_PUBLISHABLE_KEY", "CHECKIN_ADMIN_EMAILS"]) {
  if (!configured[name]?.trim()) throw new Error(`Fill ${name} in .env.checkin-test`);
}
assertTestDatabase(configured);
const app = new URL(configured.CHECKIN_APP_ORIGIN);
if (app.origin !== "http://127.0.0.1:3100") throw new Error("Test app origin must be http://127.0.0.1:3100");
const env = { ...process.env, ...configured, CHECKIN_TEST_ORIGIN: app.origin };
const args = mode === "dev"
  ? ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"]
  : ["scripts/test-backend.mjs"];
const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
child.once("error", () => { console.error("Unable to start checkin test process"); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
