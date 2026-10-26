#!/usr/bin/env node
// Create (or reset) a host account and add it to the seeded organisation as owner.
// Usage: pnpm admin:create <email> <password> [--super]
// --super also makes the user a platform admin: the Stripe sandbox/live switch on /host/billing.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local or the environment.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(process.cwd(), "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const superAdmin = args.includes("--super");
const [email, password] = args.filter((a) => a !== "--super");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = "00000000-0000-0000-0000-000000000001"; // supabase/seed.sql

if (!email || !password) {
  console.error("Usage: pnpm admin:create <email> <password> [--super]");
  process.exit(1);
}
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  if (!/already|exists|registered/i.test(created.error.message)) throw created.error;
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw created.error;
  const upd = await sb.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (upd.error) throw upd.error;
  userId = existing.id;
  console.log(`User ${email} already existed; password reset.`);
} else {
  userId = created.data.user.id;
  console.log(`Created user ${email}.`);
}

const org = await sb.from("organisations").upsert({ id: ORG_ID, name: "Cueline" }, { onConflict: "id", ignoreDuplicates: true });
if (org.error) throw org.error;
const member = await sb.from("org_members").upsert({ org_id: ORG_ID, user_id: userId, role: "owner" }, { onConflict: "org_id,user_id" });
if (member.error) throw member.error;

if (superAdmin) {
  const pa = await sb.from("platform_admins").upsert({ user_id: userId }, { onConflict: "user_id" });
  if (pa.error) throw pa.error;
  console.log(`${email} is a platform admin (Stripe mode switch on /host/billing).`);
}

console.log(`${email} (${userId}) is owner of org ${ORG_ID}. Sign in at /login.`);
