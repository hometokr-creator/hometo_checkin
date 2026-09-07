import "server-only";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function databaseEnvironment() {
  const url = new URL(required("SUPABASE_URL"));
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("SUPABASE_URL must use HTTPS outside localhost");
  }
  return { url: url.origin, key: required("SUPABASE_SERVICE_ROLE_KEY") };
}

export function accessEnvironment() {
  const secret = required("CHECKIN_ACCESS_SECRET");
  if (Buffer.byteLength(secret) < 32) throw new Error("CHECKIN_ACCESS_SECRET must contain at least 32 bytes");
  const origin = new URL(required("CHECKIN_APP_ORIGIN")).origin;
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://") && !origin.startsWith("http://localhost:")) {
    throw new Error("CHECKIN_APP_ORIGIN must use HTTPS in production");
  }
  return { secret, origin, secure: origin.startsWith("https://") };
}
