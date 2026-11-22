import { handler, HttpError, json, readJson, requireUser } from "@/lib/auth";
import { createOrganisationFor, ORG_NAME_MAX } from "@/lib/signup";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Make an organisation for a signed-in host who has none: an account made by hand (or before
 * sign-up existed) that was never added to one. Idempotent: a host who already belongs to an
 * organisation keeps it.
 */
export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  if (user.is_anonymous) throw new HttpError(403, "hosts only");
  const body = await readJson<{ name?: unknown }>(req);
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > ORG_NAME_MAX) throw new HttpError(400, `Give the organisation a name of up to ${ORG_NAME_MAX} characters.`);
  const org = await createOrganisationFor(supabaseAdmin(), user.id, name);
  return json({ org });
});
