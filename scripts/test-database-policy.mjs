// Shared by scripts that create synthetic records. Never allow the production project.
const productionHost = "rfwxpqekweizestlxomi.supabase.co";
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
function origin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Test database configuration must be an origin only");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback.has(url.hostname)))
    throw new Error("Remote test databases require HTTPS");
  return url;
}
export function assertTestDatabase(env) {
  const actual = origin(env.SUPABASE_URL);
  if (actual.hostname === productionHost)
    throw new Error("hometo_checkin is reserved for production; test writes are forbidden");
  if (!env.CHECKIN_TEST_SUPABASE_URL)
    throw new Error("Set CHECKIN_TEST_SUPABASE_URL to the dedicated test database origin");
  const expected = origin(env.CHECKIN_TEST_SUPABASE_URL);
  if (actual.origin !== expected.origin)
    throw new Error("SUPABASE_URL does not match the dedicated test database");
}
