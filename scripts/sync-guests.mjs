// Run with --conditions=react-server --import tsx. No environment file is loaded implicitly.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { databaseEnvironment } from "../src/server/env.ts";
import { GUEST_PRODUCTION_PROJECT, GuestSyncError, planGuestSync } from "../src/server/checkin/guest-sync-plan.ts";
import { readGuestSheet } from "../src/server/checkin/guest-sheet.ts";
import { persistGuestSnapshot } from "../src/server/checkin/guest-sync.ts";

try {
  const args = process.argv.slice(2);
  const flag = (name) => args.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
  if (args.some((arg) => !["--env=", "--google-env=", "--snapshot=", "--expect-project="].some((prefix) => arg.startsWith(prefix)) && arg !== "--apply")) {
    throw new GuestSyncError("UNKNOWN_ARGUMENT");
  }
  const envFile = flag("--env");
  if (!envFile) throw new GuestSyncError("EXPLICIT_ENV_FILE_REQUIRED");
  const configured = parseEnv(await readFile(envFile, "utf8"));
  // An explicit env file cannot silently inherit production credentials from the shell.
  if (!configured.SUPABASE_URL || !configured.SUPABASE_SERVICE_ROLE_KEY) throw new GuestSyncError("DATABASE_CONFIG_MISSING");
  Object.assign(process.env, configured);
  const googleEnvFile = flag("--google-env");
  if (googleEnvFile) {
    const google = parseEnv(await readFile(googleEnvFile, "utf8"));
    for (const name of ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"]) {
      process.env[name] = google[name] ?? "";
    }
  }
  const { url } = databaseEnvironment();
  const target = flag("--expect-project");
  if (!target || !/^[a-z0-9]{20}$/.test(target) || url !== `https://${target}.supabase.co`) {
    throw new GuestSyncError("EXPECTED_DATABASE_MISMATCH");
  }
  // This command is for live customer imports. Synthetic test cases use SQL rollback tests.
  if (target !== GUEST_PRODUCTION_PROJECT) throw new GuestSyncError("LIVE_SOURCE_REQUIRES_PRODUCTION_DATABASE");
  const path = flag("--snapshot");
  const snapshot = path ? JSON.parse(await readFile(path, "utf8")) : await readGuestSheet();
  const plan = planGuestSync(snapshot);
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply" : "preview", project: target,
    complete: plan.complete, excludedIncomplete: plan.incomplete, skippedPlaceholders: plan.skippedRows }));
  if (args.includes("--apply")) console.log(JSON.stringify(await persistGuestSnapshot(snapshot)));
} catch (error) {
  console.error(error instanceof GuestSyncError ? error.code : "GUEST_SYNC_FAILED_CHECK_PRIVATE_CONFIGURATION");
  process.exitCode = 1;
}
