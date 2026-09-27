import { createClient } from "@supabase/supabase-js";
import { env, publicEnv } from "@/lib/env";

/** Service-role client. Server only. Bypasses RLS, so every caller must authorise first (see lib/auth). */
export function supabaseAdmin() {
  return createClient(publicEnv.supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
