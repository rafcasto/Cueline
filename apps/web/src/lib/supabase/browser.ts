"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { viewerIdentityMessage } from "@/lib/identity";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  }
  return client;
}

/**
 * Viewers get a session-scoped anonymous identity. Idempotent. On failure the thrown
 * error's message says what is wrong (project setting, rate limit, network) rather than
 * a generic cookie hint; the original error is logged and kept as `cause`.
 */
export async function ensureViewerIdentity() {
  try {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session;
    const { data: anon, error } = await sb.auth.signInAnonymously();
    if (error || !anon.session) throw error ?? new Error("anonymous sign-in returned no session");
    return anon.session;
  } catch (err) {
    console.warn("viewer identity", err);
    throw new Error(viewerIdentityMessage(err), { cause: err });
  }
}
