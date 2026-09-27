import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function HostIndex({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/host");
  const { error } = await searchParams;
  const { data: rooms } = await sb.from("rooms").select("id, slug, name, organisations(name)").order("name");
  const { data: memberships } = await sb.from("org_members").select("org_id");
  const orgIds = new Set((memberships ?? []).map((m) => m.org_id));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your rooms</h1>
        <div className="text-sm text-neutral-500">
          {auth.user.email} · <SignOutButton />
        </div>
      </header>
      {error === "not-a-member" && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">You are not a member of that room&apos;s organisation.</p>}
      <ul className="mt-4 space-y-2">
        {(rooms ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded border p-3 dark:border-neutral-700">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-neutral-500">{(r.organisations as unknown as { name: string } | null)?.name} · /r/{r.slug}</div>
            </div>
            <Link href={`/host/${r.slug}`} className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">Open host panel</Link>
          </li>
        ))}
      </ul>
      {orgIds.size === 0 && (
        <p className="mt-6 rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          You are signed in but not yet in an organisation. Phase 1 is one hard-coded org: run the insert in <code>supabase/seed.sql</code> with your user id <code>{auth.user.id}</code>.
        </p>
      )}
    </main>
  );
}
