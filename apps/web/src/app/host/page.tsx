import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { NewRoomForm, type RoomOrg } from "@/components/NewRoomForm";
import { Alert, Badge, PageHeader, buttonClass } from "@/components/ui";
import { isPlatformAdmin } from "@/lib/auth";
import { effectivePlan } from "@/lib/billing";
import { planLimits } from "@/lib/plans";
import { roomAllowance, roomsLeft } from "@/lib/rooms";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HostIndex({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/host");
  const { error } = await searchParams;
  const [{ data: rooms }, { data: memberships }, { data: orgs }, { data: openSessions }, platformAdmin] = await Promise.all([
    sb.from("rooms").select("id, org_id, slug, name, topics, organisations(name)").order("name"),
    sb.from("org_members").select("org_id, role"),
    sb.from("organisations").select("id, name, plan, plan_status, extra_rooms").order("name"),
    sb.from("sessions").select("room_id, state").neq("state", "ended"),
    isPlatformAdmin(auth.user.id),
  ]);
  const orgIds = new Set((memberships ?? []).map((m) => m.org_id));
  // Presenters run rooms but do not create them. Every plan includes one room; platform admins are not capped.
  const creatorOrgIds = new Set((memberships ?? []).filter((m) => m.role === "owner" || m.role === "host").map((m) => m.org_id));
  const creatorOrgs: RoomOrg[] = (orgs ?? [])
    .filter((o) => creatorOrgIds.has(o.id))
    .map((o) => {
      const used = (rooms ?? []).filter((r) => r.org_id === o.id).length;
      const allowance = roomAllowance(planLimits(effectivePlan(o)), o.extra_rooms ?? 0, platformAdmin);
      return { id: o.id, name: o.name, roomsLeft: roomsLeft(allowance, used) };
    });
  const stateByRoom = new Map((openSessions ?? []).map((s) => [s.room_id, s.state as string]));
  const atCap = creatorOrgs.length > 0 && creatorOrgs.every((o) => o.roomsLeft === 0);

  return (
    <AppShell email={auth.user.email}>
      <PageHeader
        title="Your rooms"
        description="Each room has its own events and invite links, email sequence, deck, activities and waiting room. Every plan includes one; buy more from Billing when you need them."
        actions={orgIds.size > 0 && (rooms ?? []).length > 0 ? <NewRoomForm orgs={creatorOrgs} /> : undefined}
      />
      {error === "not-a-member" && (
        <Alert tone="danger" className="mt-6">
          You are not a member of that room&apos;s organisation.
        </Alert>
      )}
      {atCap && (rooms ?? []).length > 0 && (
        <Alert tone="neutral" className="mt-6">
          Your plan includes one room and it is in use. Another room is a one-off purchase on the{" "}
          <Link href="/host/billing#rooms" className="font-medium text-brand hover:underline">
            billing page
          </Link>
          .
        </Alert>
      )}

      {orgIds.size === 0 ? (
        <Alert tone="warning" className="mt-6" title="Signed in, but not in an organisation yet">
          Phase 1 has one hard-coded organisation. Run the insert in <code className="rounded bg-surface-inset px-1">supabase/seed.sql</code> with your user id{" "}
          <code className="rounded bg-surface-inset px-1">{auth.user.id}</code>, then reload.
        </Alert>
      ) : (rooms ?? []).length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line p-8">
          <h2 className="text-base font-semibold text-ink">Set up your room</h2>
          <p className="mt-1 text-sm text-ink-muted">A room is where your sessions happen. Name it, say what it is about so people can find it, then add an event and share the invite link.</p>
          <div className="mt-5">
            <NewRoomForm orgs={creatorOrgs} autoOpen />
          </div>
        </div>
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
                    {(r.topics as string[] | null)?.length ? <p className="mt-1 truncate text-xs text-ink-faint">{(r.topics as string[]).join(" · ")}</p> : null}
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
