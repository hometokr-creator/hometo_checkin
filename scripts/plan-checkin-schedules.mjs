import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { scheduleOptions, contractResolution } from "./checkin-schedule-options.mjs";

try {
  const args = process.argv.slice(2);
  const initial = scheduleOptions(args);
  const env = parseEnv(await readFile(initial.env, "utf8"));
  const options = scheduleOptions(args, env);
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (options.resolution) {
    const input = contractResolution(JSON.parse(await readFile(options.resolution, "utf8")));
    const { error } = await db.rpc("resolve_checkin_contract_change", input);
    if (error) throw new Error("CONTRACT_RESOLUTION_FAILED_CHECK_LATEST_PREVIEW");
    console.log("Contract change resolved; no messages or tokens were created.");
  }
  const { data, error } = await db.rpc("plan_checkin_schedules", { p_dry_run: !options.apply });
  if (error || !data || !Array.isArray(data.schedules) || !Array.isArray(data.contracts)) throw new Error("SCHEDULE_PLAN_FAILED");
  await mkdir("artifacts/private", { recursive: true });
  const file = resolve(`artifacts/private/checkin-schedule-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify(data, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ project: options["expect-project"], dryRun: data.dryRun,
    guests: data.guests, planned: data.planned, heldGuests: data.heldGuests }));
  console.log("Private schedule report:", file);
} catch (error) {
  const allowed = ["DUPLICATE_ARGUMENT", "UNKNOWN_ARGUMENT", "EXPLICIT_ENV_FILE_REQUIRED", "EXPECTED_DATABASE_REQUIRED",
    "EXPECTED_DATABASE_MISMATCH", "RESOLUTION_REQUIRES_APPLY", "INVALID_CONTRACT_RESOLUTION",
    "CONTRACT_RESOLUTION_FAILED_CHECK_LATEST_PREVIEW", "SCHEDULE_PLAN_FAILED"];
  console.error(allowed.includes(error?.message) ? error.message : "SCHEDULE_COMMAND_FAILED_CHECK_CONFIGURATION");
  process.exitCode = 1;
}
