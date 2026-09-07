import "server-only";
import { createClient } from "@supabase/supabase-js";
import { databaseEnvironment } from "./env";

// Lazy initialization: builds do not need production secrets.
// This client must never be re-exported from a domain/client barrel.
export function getDb() {
  const { url, key } = databaseEnvironment();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
