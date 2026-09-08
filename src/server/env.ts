import "server-only";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function databaseEnvironment() {
  const url = new URL(required("SUPABASE_URL"));
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("SUPABASE_URL must use HTTPS outside localhost");
  }
  return { url: url.origin, key: required("SUPABASE_SERVICE_ROLE_KEY") };
}

export function accessEnvironment() {
  const secret = required("CHECKIN_ACCESS_SECRET");
  if (Buffer.byteLength(secret) < 32)
    throw new Error("CHECKIN_ACCESS_SECRET must contain at least 32 bytes");
  const appUrl = new URL(required("CHECKIN_APP_ORIGIN"));
  const origin = appUrl.origin;
  if (
    appUrl.protocol !== "https:" &&
    !(
      appUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname)
    )
  ) {
    throw new Error("CHECKIN_APP_ORIGIN must use HTTPS in production");
  }
  return { secret, origin, secure: origin.startsWith("https://") };
}

export function adminEnvironment() {
  const url = new URL(required("SUPABASE_URL"));
  const appUrl = new URL(required("CHECKIN_APP_ORIGIN"));
  for (const value of [url, appUrl]) {
    if (value.protocol !== "https:" && !(value.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname))) {
      throw new Error("Admin URLs must use HTTPS outside localhost");
    }
  }
  const emails = required("CHECKIN_ADMIN_EMAILS").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!emails.length || emails.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    throw new Error("Invalid admin allowlist");
  }
  return {
    url: url.origin,
    key: required("SUPABASE_PUBLISHABLE_KEY"),
    origin: appUrl.origin,
    secure: appUrl.protocol === "https:",
    emails,
  };
}
