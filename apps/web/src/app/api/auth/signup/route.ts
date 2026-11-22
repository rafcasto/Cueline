import { handler, HttpError, json, readJson } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { createOrganisationFor, isExistingUser, safeNext, validateSignup } from "@/lib/signup";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Host sign-up. The user is made through the cookie client, the same way login works, so when
 * the project does not ask for email confirmation the session cookie arrives as a Set-Cookie
 * header and the host is signed in on the way out. When it does, no session comes back: the
 * host confirms from the email, lands on /auth/callback and is signed in there. Either way the
 * organisation is made now, with the new user as owner, so /host has somewhere to put the
 * first (free) room. If the organisation cannot be made the user is removed again rather than
 * left signed in with nowhere to go.
 */
export const POST = handler(async (req) => {
  const body = await readJson<{ organisation?: unknown; email?: unknown; password?: unknown; next?: unknown }>(req);
  const checked = validateSignup(body);
  if (!checked.ok) throw new HttpError(400, checked.error);
  const { organisation, email, password } = checked.value;
  const next = safeNext(body.next);

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`, data: { organisation } },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") throw new HttpError(409, "There is already an account with this email. Log in instead.");
    if (error.code === "signup_disabled") throw new HttpError(503, "Sign-ups are switched off in the Supabase project (Authentication → Sign In / Providers).");
    if (error.code === "weak_password") throw new HttpError(400, error.message);
    throw new HttpError(400, error.message);
  }
  if (!data.user || isExistingUser(data.user)) throw new HttpError(409, "There is already an account with this email. Log in instead.");

  const admin = supabaseAdmin();
  try {
    await createOrganisationFor(admin, data.user.id, organisation);
  } catch (err) {
    console.error("signup organisation", err);
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    if (data.session) await sb.auth.signOut().catch(() => undefined);
    throw new HttpError(500, "Could not set up your organisation. Nothing was saved; try again in a moment.");
  }

  return json({ ok: true, signedIn: !!data.session, email, next });
});
