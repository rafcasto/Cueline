import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Alert, Badge, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HostIndex({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/host");
  const { error } = await searchParams;
  const [{ data: rooms }, { data: memberships }, { data: openSessions }] = await Promise.all([
    sb.from("rooms").select("id, slug, name, organisations(name)").order("name"),
    sb.from("org_members").select("org_id"),
    sb.from("sessions").select("room_id, state").neq("state", "ended"),
  ]);
  const orgIds = new Set((memberships ?? []).map((m) => m.org_id));
  const stateByRoom = new Map((openSessions ?? []).map((s) => [s.room_id, s.state as string]));

  return (
    <AppShell email={auth.user.email}>
      <PageHeader title="Your rooms" description="Each room has its own invite links, deck, activities and waiting room." />
      {error === "not-a-member" && (
        <Alert tone="danger" className="mt-6">
          You are not a member of that room&apos;s organisation.
        </Alert>
      )}

      {orgIds.size === 0 ? (
        <Alert tone="warning" className="mt-6" title="Signed in, but not in an organisation yet">
          Phase 1 has one hard-coded organisation. Run the insert in <code className="rounded bg-surface-inset px-1">supabase/seed.sql</code> with your user id{" "}
          <code className="rounded bg-surface-inset px-1">{auth.user.id}</code>, then reload.
        </Alert>
      ) : (rooms ?? []).length === 0 ? (
        <EmptyState className="mt-6" title="No rooms yet" description="Rooms are created in the database for now. The seed creates one called Main room." />
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {(rooms ?? []).map((r) => {
            const state = stateByRoom.get(r.id);
            return (
              <li key={r.id} className="group rounded-xl border border-line bg-surface-raised p-5 shadow-card transition-shadow hover:shadow-float">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink">{r.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-ink-muted">
                      {(r.organisations as unknown as { name: string } | null)?.name} · /r/{r.slug}
                    </p>
                  </div>
                  {state === "live" ? (
                    <Badge tone="live" dot>
                      Live
                    </Badge>
                  ) : state === "waiting" ? (
                    <Badge tone="brand" dot>
                      Doors open
                    </Badge>
                  ) : (
                    <Badge>Closed</Badge>
                  )}
                </div>
                <div className="mt-5 flex gap-2">
                  <Link href={`/host/${r.slug}`} className={buttonClass("primary", "sm")}>
                    Open host panel
                  </Link>
                  <Link href={`/r/${r.slug}`} className={buttonClass("ghost", "sm")}>
                    View as attendee
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
