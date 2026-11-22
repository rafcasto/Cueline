import { handler, HttpError, json, readJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Host sign-in, done on the server so the session cookie arrives as a Set-Cookie header
 * rather than being written by script in the browser. Safari caps script-written cookies at
 * seven days; a header-set cookie keeps its full life, so a host stays signed in until they
 * sign out. The browser client reads the same cookie, so nothing else changes.
 */
export const POST = handler(async (req) => {
  const body = await readJson<{ email?: unknown; password?: unknown }>(req);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw new HttpError(400, "Enter your email and password.");
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new HttpError(401, error?.message ?? "Sign-in failed. Try again.");
  return json({ ok: true, user: { id: data.user.id, email: data.user.email } });
});
