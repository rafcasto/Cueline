import Link from "next/link";
import { PublicShell } from "@/components/AppShell";
import { EventCard, RoomCard, TopicChips } from "@/components/ExploreCards";
import { Button, EmptyState, Input, cx } from "@/components/ui";
import { listPublicEvents, listPublicRooms, listTopics } from "@/lib/explore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore live sessions · Tertulia" };

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
    <PublicShell>
      <section className="pt-6 sm:pt-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Explore</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Find a live session to join</h1>
        <p className="mt-2 max-w-2xl text-base text-ink-muted">Public rooms on Tertulia and the sessions they have coming up. Register in two fields; the host&apos;s reminders do the rest.</p>
        <form action="/explore" method="get" className="mt-6 flex max-w-xl gap-2">
          {view !== "events" && <input type="hidden" name="view" value={view} />}
          {topic && <input type="hidden" name="topic" value={topic} />}
          <Input name="q" defaultValue={q ?? ""} placeholder={view === "rooms" ? "Search rooms" : "Search events and rooms"} aria-label="Search" className="flex-1" />
          <Button type="submit" variant="secondary">
            Search
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
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", view === v ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {v === "events" ? "Upcoming events" : "Rooms"}
          </Link>
        ))}
        {(q || topic) && (
          <Link href={href({ q: undefined, topic: undefined })} className="ml-auto self-center text-sm text-ink-muted hover:text-ink">
            Clear filters
          </Link>
        )}
      </nav>

      {view === "events" ? (
        events.length === 0 ? (
          <EmptyState className="mt-8" title={q || topic ? "No upcoming events match" : "No public events yet"} description={q || topic ? "Try another word or topic, or browse the rooms." : "Hosts list an event by marking it public in their room. Check back soon."} action={<Link href={href({ view: "rooms", q: undefined, topic: undefined })} className="text-sm font-medium text-brand hover:underline">Browse rooms</Link>} />
        ) : (
          <ul className="mt-6 grid gap-4 lg:grid-cols-2">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </ul>
        )
      ) : rooms.length === 0 ? (
        <EmptyState className="mt-8" title={q || topic ? "No rooms match" : "No public rooms yet"} description="A host lists a room from its Settings tab." />
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <RoomCard key={r.id} room={r} />
          ))}
        </ul>
      )}

      <p className="mt-12 text-sm text-ink-muted">
        Run sessions yourself?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Host sign in
        </Link>{" "}
        and list your room from its settings.
      </p>
    </PublicShell>
  );
}
