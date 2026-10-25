import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/supabase/types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Resolve the calling user from either the auth cookie (web app) or a bearer
 * token (any non-browser client, e.g. a future companion app).
 */
export async function currentUser(req: Request): Promise<{ user: User; client: SupabaseClient } | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) {
    const client = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(bearer);
    return data.user ? { user: data.user, client } : null;
  }
  const client = await supabaseServer();
  const { data } = await client.auth.getUser();
  return data.user ? { user: data.user, client } : null;
}

export async function requireUser(req: Request) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, "not signed in");
  return u;
}

/** Org membership check for host-side actions. Uses the service client so the check itself never trips RLS. */
export async function requireOrgRole(userId: string, orgId: string, roles: OrgRole[] = ["owner", "host", "presenter"]) {
  const { data } = await supabaseAdmin()
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !roles.includes(data.role as OrgRole)) throw new HttpError(403, "not a member of this organisation");
  return data.role as OrgRole;
}

/** The platform's own admins (the "super user"): the Stripe mode switch and nothing an org owner can do. */
export async function requirePlatformAdmin(userId: string) {
  const { data } = await supabaseAdmin().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(403, "platform admins only");
}

export async function isPlatformAdmin(userId: string) {
  const { data } = await supabaseAdmin().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

/** Wrap a route handler so HttpError and unexpected errors become JSON responses. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      console.error(err);
      return json({ error: "internal error" }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}
