/**
 * Host sign-up: what a new host gives us and the organisation that is made for them. The
 * organisation is the billing unit (its Stripe customer, its rooms); the first room is free and
 * made from /host once they are in. Pure functions here are unit-tested; the loader at the
 * bottom writes with the service client, since a user who is not yet a member of anything
 * cannot insert an organisation under RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PASSWORD_MIN = 8;
export const ORG_NAME_MAX = 80;

export type SignupInput = { organisation: string; email: string; password: string };

/** Trimmed, lower-cased email and a trimmed organisation name, or the one thing to fix. */
export function validateSignup(raw: Partial<Record<keyof SignupInput, unknown>>): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const organisation = typeof raw.organisation === "string" ? raw.organisation.trim().replace(/\s+/g, " ") : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  if (organisation.length < 1) return { ok: false, error: "Give your organisation a name; your own name is fine." };
  if (organisation.length > ORG_NAME_MAX) return { ok: false, error: `Keep the organisation name under ${ORG_NAME_MAX} characters.` };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (password.length < PASSWORD_MIN) return { ok: false, error: `Use a password of at least ${PASSWORD_MIN} characters.` };
  return { ok: true, value: { organisation, email, password } };
}

/**
 * Supabase's answer to signUp when the address is already taken and confirmation is on: a
 * user with no identities and no session, so the form cannot be used to probe addresses. We
 * do not need that protection (the login form already says whether a password matches), and
 * a host who re-enters an address they own needs to be sent to the login page, not left
 * waiting for an email that never comes.
 */
export function isExistingUser(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/** Where to send a new host after sign-up: a same-origin path, or their rooms. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/host";
}

// ---------------------------------------------------------------------------
// Loader (service client)
// ---------------------------------------------------------------------------

/**
 * Make the organisation and put the user in it as owner. Idempotent per user: a user who
 * already belongs to an organisation keeps it and gets nothing new, so a retried sign-up
 * request (or a second device) cannot leave them owning two.
 */
export async function createOrganisationFor(admin: SupabaseClient, userId: string, name: string): Promise<{ id: string; name: string; created: boolean }> {
  const { data: existing } = await admin.from("org_members").select("org_id, organisations(name)").eq("user_id", userId).limit(1).maybeSingle();
  if (existing) {
    const org = existing.organisations as unknown as { name: string } | null;
    return { id: existing.org_id as string, name: org?.name ?? name, created: false };
  }
  const { data: org, error } = await admin.from("organisations").insert({ name }).select("id, name").single();
  if (error || !org) throw error ?? new Error("could not create the organisation");
  const { error: memberError } = await admin.from("org_members").insert({ org_id: org.id, user_id: userId, role: "owner" });
  if (memberError) {
    await admin.from("organisations").delete().eq("id", org.id);
    throw memberError;
  }
  return { id: org.id as string, name: org.name as string, created: true };
}
