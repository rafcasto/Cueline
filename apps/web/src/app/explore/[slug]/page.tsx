import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/AppShell";
import { EventCard, TopicChips } from "@/components/ExploreCards";
import { BrandScope, RoomCtaButton, RoomMark } from "@/components/RoomBrand";
import { Badge, ButtonLink, EmptyState, Stat } from "@/components/ui";
import { formatEventTime, publicRoomBySlug } from "@/lib/explore";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await publicRoomBySlug(slug);
  return { title: found ? `${found.room.name} · Tertulia` : "Room" };
}

/**
 * A listed room's public page: what it is about, what is coming up (with the way to register),
 * and what it has run before. The room's accent and logo apply, as on its invite pages.
 */
export default async function PublicRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await publicRoomBySlug(slug);
  if (!found) notFound();
  const { room, upcoming, past } = found;
  const live = room.session_state === "live";

  return (
    <PublicShell>
      <BrandScope branding={room.branding}>
        <nav className="pt-4 text-sm text-ink-muted" aria-label="Breadcrumb">
          <Link href="/explore" className="hover:text-ink">
            Explore
          </Link>{" "}
          <span aria-hidden>/</span> <span className="text-ink">{room.name}</span>
        </nav>
        <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex h-20 shrink-0 items-center rounded-2xl bg-brand-soft px-5">
            <RoomMark branding={room.branding} name={room.name} className="h-10 max-w-56" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{room.name}</h1>
              {live && (
                <Badge tone="live" dot>
                  Live now
                </Badge>
              )}
            </div>
            {room.description && <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-muted">{room.description}</p>}
            {room.topics.length > 0 && <TopicChips topics={room.topics} className="mt-3" />}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {live && (
                <ButtonLink href={`/r/${room.slug}`} variant="success">
                  Join the live session
                </ButtonLink>
              )}
              {!live && upcoming[0] && <ButtonLink href={`/join/${upcoming[0].token}`}>Register for the next event</ButtonLink>}
              <RoomCtaButton branding={room.branding} size="md" />
            </div>
          </div>
          <div className="flex gap-8 sm:pt-2">
            <Stat value={room.upcoming_events} label="Upcoming" />
            <Stat value={room.past_events} label="Past" />
            <Stat value={room.people} label="People" />
          </div>
        </header>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-ink">Upcoming events</h2>
          {upcoming.length === 0 ? (
            <EmptyState className="mt-4" title="Nothing scheduled yet" description="The host has not published the next event. Check back, or look at other rooms." action={<Link href="/explore" className="text-sm font-medium text-brand hover:underline">Back to Explore</Link>} />
          ) : (
            <ul className="mt-4 grid gap-4">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-ink">Past events</h2>
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface-raised">
              {past.map((e) => {
                const { day } = formatEventTime(e.starts_at, e.timezone);
                return (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                    <span className="text-sm font-medium text-ink">{e.title}</span>
                    <span className="text-xs text-ink-muted">
                      {day} · {e.going === 1 ? "1 registered" : `${e.going} registered`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </BrandScope>
    </PublicShell>
  );
}
