import Link from "next/link";
import { PublicFooter, PublicShell } from "@/components/AppShell";
import { EventCard, RoomCard, TopicChips } from "@/components/ExploreCards";
import { Button, ButtonLink, EmptyState, Input, cx } from "@/components/ui";
import { listPublicEvents, listPublicRooms, listTopics } from "@/lib/explore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore rooms · Tertulia" };

type Params = { view?: string; q?: string; topic?: string };

/**
 * The directory: upcoming public events across every listed room, and the rooms themselves,
 * with a search box and topic chips. Plain links and a GET form, so it works without
 * JavaScript and every view has a URL worth sharing.
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view = params.view === "rooms" ? "rooms" : "events";
  const q = params.q?.trim() || undefined;
  const topic = params.topic?.trim().toLowerCase() || undefined;
  const [events, rooms, topics] = await Promise.all([view === "events" ? listPublicEvents({ q, topic }) : Promise.resolve([]), view === "rooms" ? listPublicRooms({ q, topic }) : Promise.resolve([]), listTopics()]);

  const href = (next: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged = { view, q, topic, ...next };
    if (merged.view && merged.view !== "events") p.set("view", merged.view);
    if (merged.q) p.set("q", merged.q);
    if (merged.topic) p.set("topic", merged.topic);
    const s = p.toString();
    return s ? `/explore?${s}` : "/explore";
  };

  return (
    <>
      <PublicShell>
        <section className="pt-6 sm:pt-10">
          <h1 className="text-4xl tracking-tight text-ink sm:text-5xl">Find a room</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-muted">Public rooms on Tertulia and the live sessions they have coming up. Register with a name and an email; the rest arrives by email.</p>
          <form action="/explore" method="get" className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
            {view !== "events" && <input type="hidden" name="view" value={view} />}
            {topic && <input type="hidden" name="topic" value={topic} />}
            <Input name="q" defaultValue={q ?? ""} placeholder={view === "rooms" ? "Search topics like careers, AI, business…" : "Search events and rooms"} aria-label="Search" className="h-12 flex-1 text-base" />
            <Button type="submit" size="lg">
              {view === "rooms" ? "Find a room" : "Search"}
            </Button>
          </form>
          {topics.length > 0 && <TopicChips topics={topics.map((t) => t.topic)} active={topic} className="mt-4" base={view === "rooms" ? "/explore?view=rooms" : "/explore"} />}
        </section>

        <nav className="mt-8 flex gap-1 border-b border-line" aria-label="Explore views">
          {(["events", "rooms"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-semibold", view === v ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink")}
            >
              {v === "events" ? "Upcoming events" : "Rooms"}
            </Link>
          ))}
          {(q || topic) && (
            <Link href={href({ q: undefined, topic: undefined })} className="ml-auto self-center text-sm font-semibold text-brand hover:text-brand-hover hover:underline">
              Clear filters
            </Link>
          )}
        </nav>

        {view === "events" ? (
          events.length === 0 ? (
            <EmptyState
              className="mt-8"
              title={q || topic ? "No upcoming events match" : "No events yet. Be the first to open a room."}
              description={q || topic ? "Try another word or topic, or browse the rooms." : "Hosts list an event by marking it public in their room. Check back soon."}
              action={
                <Link href={href({ view: "rooms", q: undefined, topic: undefined })} className="text-sm font-semibold text-brand hover:text-brand-hover hover:underline">
                  Browse rooms
                </Link>
              }
            />
          ) : (
            <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </ul>
          )
        ) : rooms.length === 0 ? (
          <EmptyState className="mt-8" title={q || topic ? "No rooms match" : "No rooms listed yet"} description="A host lists a room from its Settings tab." />
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </ul>
        )}

        <div className="mt-14 flex flex-col items-start gap-4 rounded-xl bg-surface-raised p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl text-ink">Run live sessions yourself?</h2>
            <p className="mt-1 text-sm text-ink-muted">Open your own room, run your live event, and see who in the audience is ready for more.</p>
          </div>
          <ButtonLink href="/for-hosts" variant="secondary" className="shrink-0" data-track="explore_host_event">
            Host an event
          </ButtonLink>
        </div>
      </PublicShell>
      <PublicFooter />
    </>
  );
}
