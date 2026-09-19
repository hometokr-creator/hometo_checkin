// Explicit environment/project selection; never inherit a production key from the shell.
export function scheduleOptions(args, configured) {
  const supported = new Set(["env", "expect-project", "resolution"]);
  const options = { apply: false };
  for (const arg of args) {
    if (arg === "--apply") { if (options.apply) throw new Error("DUPLICATE_ARGUMENT"); options.apply = true; continue; }
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (!match || !supported.has(match[1])) throw new Error("UNKNOWN_ARGUMENT");
    if (Object.hasOwn(options, match[1])) throw new Error("DUPLICATE_ARGUMENT");
    options[match[1]] = match[2];
  }
  if (!options.env) throw new Error("EXPLICIT_ENV_FILE_REQUIRED");
  const project = options["expect-project"];
  if (!project || !/^[a-z0-9]{20}$/.test(project)) throw new Error("EXPECTED_DATABASE_REQUIRED");
  if (configured) {
    if (configured.SUPABASE_URL !== `https://${project}.supabase.co` || !configured.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("EXPECTED_DATABASE_MISMATCH");
    }
  }
  if (options.resolution && !options.apply) throw new Error("RESOLUTION_REQUIRES_APPLY");
  return options;
}
export function contractResolution(value) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!value || !uuid.test(value.guestUuid ?? "") || !uuid.test(value.expectedContractId ?? "") ||
    !date(value.expectedStart) || !date(value.expectedEnd) || value.expectedEnd <= value.expectedStart ||
    !["correction", "renewal"].includes(value.kind)) throw new Error("INVALID_CONTRACT_RESOLUTION");
  return { p_guest_id: value.guestUuid, p_expected_contract_id: value.expectedContractId,
    p_expected_start: value.expectedStart, p_expected_end: value.expectedEnd, p_kind: value.kind };
}
