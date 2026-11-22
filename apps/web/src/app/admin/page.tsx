import { redirect } from "next/navigation";
import { AdminRecordings, type AdminRecording } from "@/components/AdminRecordings";
import { AppShell } from "@/components/AppShell";
import { StripeModeSwitch } from "@/components/StripeModeSwitch";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, TextLink, type Tone } from "@/components/ui";
import { isPlatformAdmin } from "@/lib/auth";
import { roomAccess } from "@/lib/billing";
import { activeStripeMode, modeConfigured } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type HostRow = { id: string; email: string; created_at: string; last_sign_in_at: string | null; orgs: { name: string; role: string }[]; admin: boolean };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * The platform's own view, for platform admins only (`pnpm admin:create … --super`): who has
 * signed up (host accounts and attendee registrations), every organisation with its rooms and
 * their plans, the sessions that ran, every recording with a delete, and the Stripe mode
 * switch. Everything is read with the service client after the admin check; nothing here is
 * reachable by an organisation owner.
 */
export default async function AdminPage() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/admin");
  if (!(await isPlatformAdmin(auth.user.id))) redirect("/host");

  const admin = supabaseAdmin();
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [
    users,
    { data: orgs },
    { data: members },
    { data: rooms },
    { data: subs },
    { data: admins },
    { count: registrationsTotal },
    { count: registrations30 },
    { data: latestRegistrations },
    { count: sessionsTotal },
    { count: sessions30 },
    { data: openSessions },
    { data: recorded },
    mode,
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("organisations").select("id, name, created_at").order("created_at"),
    admin.from("org_members").select("org_id, user_id, role"),
    admin.from("rooms").select("id, org_id, name, slug, plan, plan_status, complimentary, is_public, created_at").order("created_at"),
    admin.from("room_subscriptions").select("room_id, stripe_subscription_id, price_lookup, current_period_end"),
    admin.from("platform_admins").select("user_id"),
    admin.from("registrations").select("id", { count: "exact", head: true }),
    admin.from("registrations").select("id", { count: "exact", head: true }).gte("created_at", since30),
    admin.from("registrations").select("id, name, email, created_at, waitlisted_at, cancelled_at, rooms(name), invites(title, starts_at)").order("created_at", { ascending: false }).limit(25),
    admin.from("sessions").select("id", { count: "exact", head: true }).not("started_at", "is", null),
    admin.from("sessions").select("id", { count: "exact", head: true }).gte("started_at", since30),
    admin.from("sessions").select("id, room_id, state").neq("state", "ended"),
    admin.from("sessions").select("id, room_id, started_at, ended_at, recording_url, recording_expires_at, recording_deleted_at, rooms(name, slug, org_id)").eq("state", "ended").not("recording_url", "is", null).order("started_at", { ascending: false }).limit(200),
    activeStripeMode(),
  ]);

  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const adminIds = new Set((admins ?? []).map((a) => a.user_id));
  const allUsers = users.data?.users ?? [];
  const hosts: HostRow[] = allUsers
    .filter((u) => !u.is_anonymous && u.email)
    .map((u) => ({
      id: u.id,
      email: u.email!,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      orgs: (members ?? []).filter((m) => m.user_id === u.id).map((m) => ({ name: orgName.get(m.org_id) ?? m.org_id, role: m.role })),
      admin: adminIds.has(u.id),
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const attendees = allUsers.filter((u) => u.is_anonymous).length;
  const roomsByOrg = (orgId: string) => (rooms ?? []).filter((r) => r.org_id === orgId);
  const paidRooms = (rooms ?? []).filter((r) => roomAccess(r, roomsByOrg(r.org_id).length).paid).length;
  const complimentaryRooms = (rooms ?? []).filter((r) => r.complimentary).length;
  const liveNow = (openSessions ?? []).filter((s) => s.state === "live").length;
  const stateByRoom = new Map((openSessions ?? []).map((s) => [s.room_id, s.state as string]));
  const subByRoom = new Map((subs ?? []).map((s) => [s.room_id, s]));

  const recordings: AdminRecording[] = (recorded ?? []).map((s) => {
    const room = s.rooms as unknown as { name: string; slug: string; org_id: string } | null;
    return {
      id: s.id,
      room_name: room?.name ?? "—",
      room_slug: room?.slug ?? "",
      org_name: room ? (orgName.get(room.org_id) ?? "—") : "—",
      started_at: s.started_at,
      ended_at: s.ended_at,
      recording_url: s.recording_url!,
      recording_expires_at: s.recording_expires_at,
      recording_deleted_at: s.recording_deleted_at,
    };
  });

  return (
    <AppShell email={auth.user.email} portal="admin" platformAdmin>
      <PageHeader title="Platform" description="Who has signed up, every organisation with its rooms and plans, the sessions that ran, and every recording. Only platform admins see this page." />

      <Card className="mt-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat value={hosts.length} label="Host accounts" />
          <Stat value={(orgs ?? []).length} label="Organisations" />
          <Stat value={(rooms ?? []).length} label="Rooms" />
          <Stat value={paidRooms} label="Paid rooms" />
          <Stat value={registrationsTotal ?? 0} label="Registrations" />
          <Stat value={registrations30 ?? 0} label="Registrations, 30 days" />
          <Stat value={sessionsTotal ?? 0} label="Sessions run" />
          <Stat
            value={
              <span className="flex items-center gap-2">
                {sessions30 ?? 0}
                {liveNow > 0 && (
                  <Badge tone="live" dot>
                    {liveNow} live now
                  </Badge>
                )}
              </span>
            }
            label="Sessions, 30 days"
          />
        </div>
        <p className="mt-4 text-xs text-ink-faint">
          {attendees} attendee identities (anonymous sign-ins) · {complimentaryRooms} complimentary {complimentaryRooms === 1 ? "room" : "rooms"}
        </p>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Host accounts" description="Everyone who can sign in at /login, newest first, with their organisations." />
        {hosts.length === 0 ? (
          <EmptyState className="mt-4" title="No hosts yet" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Organisations</th>
                  <th className="py-2 pr-4">Signed up</th>
                  <th className="py-2">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {hosts.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-ink">{h.email}</span>
                      {h.admin && (
                        <Badge tone="brand" className="ml-2">
                          admin
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-ink-muted">{h.orgs.length === 0 ? <span className="text-warning-ink">not in an organisation</span> : h.orgs.map((o) => `${o.name} (${o.role})`).join(", ")}</td>
                    <td className="py-2 pr-4 text-ink-muted">{day(h.created_at)}</td>
                    <td className="py-2 text-ink-muted">{h.last_sign_in_at ? when(h.last_sign_in_at) : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Organisations and rooms" description="Each room with its plan; a room's host panel opens as that organisation's member would see it." />
        {(orgs ?? []).length === 0 ? (
          <EmptyState className="mt-4" title="No organisations yet" />
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {(orgs ?? []).map((o) => {
              const mine = roomsByOrg(o.id);
              const people = (members ?? []).filter((m) => m.org_id === o.id).length;
              return (
                <li key={o.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{o.name}</h3>
                    <p className="text-xs text-ink-muted">
                      {people} {people === 1 ? "member" : "members"} · {mine.length} {mine.length === 1 ? "room" : "rooms"} · since {day(o.created_at)}
                    </p>
                  </div>
                  {mine.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {mine.map((r) => {
                        const access = roomAccess(r, mine.length);
                        const sub = subByRoom.get(r.id);
                        const tier: { tone: Tone; label: string } = access.locked
                          ? { tone: "warning", label: r.plan_status === "unpaid" ? "Payment pending" : "Locked" }
                          : access.complimentary
                            ? { tone: "brand", label: "Complimentary" }
                            : { tone: access.paid ? "brand" : "neutral", label: access.limits.label };
                        const state = stateByRoom.get(r.id);
                        return (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <TextLink href={`/host/${r.slug}`}>{r.name}</TextLink>
                            <span className="text-xs text-ink-faint">/r/{r.slug}</span>
                            <Badge tone={tier.tone}>{tier.label}</Badge>
                            {sub?.price_lookup && <span className="text-xs text-ink-muted">{sub.price_lookup.replace("_", " ")}{sub.current_period_end ? ` · renews ${day(sub.current_period_end)}` : ""}</span>}
                            {r.is_public && <Badge tone="neutral">on Explore</Badge>}
                            {state === "live" ? (
                              <Badge tone="live" dot>
                                Live
                              </Badge>
                            ) : state === "waiting" ? (
                              <Badge tone="brand" dot>
                                Doors open
                              </Badge>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Latest registrations" description="The last 25 attendees to register for an event, across every room." />
        {(latestRegistrations ?? []).length === 0 ? (
          <EmptyState className="mt-4" title="No registrations yet" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Room · event</th>
                  <th className="py-2">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(latestRegistrations ?? []).map((r) => {
                  const room = r.rooms as unknown as { name: string } | null;
                  const invite = r.invites as unknown as { title: string; starts_at: string | null } | null;
                  return (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 font-medium text-ink">
                        {r.name}
                        {r.cancelled_at ? <Badge className="ml-2">opted out</Badge> : r.waitlisted_at ? <Badge tone="warning" className="ml-2">waiting list</Badge> : null}
                      </td>
                      <td className="py-2 pr-4 text-ink-muted">{r.email}</td>
                      <td className="py-2 pr-4 text-ink-muted">
                        {room?.name ?? "—"}
                        {invite?.title ? ` · ${invite.title}` : ""}
                      </td>
                      <td className="py-2 text-ink-muted">{when(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <AdminRecordings recordings={recordings} />
      </div>

      <div className="mt-6">
        <StripeModeSwitch mode={mode} configured={{ test: modeConfigured("test"), live: modeConfigured("live") }} />
      </div>
    </AppShell>
  );
}
