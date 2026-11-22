import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/AppShell";
import { EventCard, RoomCard, TopicTiles } from "@/components/ExploreCards";
import { Button, ButtonLink, EmptyState, Input, cx } from "@/components/ui";
import liveRoom from "@/images/live-room.webp";
import waitingRoom from "@/images/waiting-room.webp";
import { listPublicEvents, listPublicRooms, listTopics, type PublicEvent, type PublicRoom } from "@/lib/explore";

export const dynamic = "force-dynamic";

/**
 * The home page serves attendees: most visitors arrive from an event link, so it is "Join a
 * room" from top to bottom (docs/BRAND.md, Website). A warm hero with a topic search, then
 * what is actually happening (the next public events and the rooms running them, read live
 * from the directory), topics to browse, how joining works, one espresso band that sends
 * hosts to /for-hosts (the page that does the selling), and the footer. Cream page, white
 * cards, terracotta for the big marks only, teal for anything you can click. The hero picture
 * is the room itself, in an espresso frame: the product's screenshot is cream inside, so
 * without the frame it has no edge against the page.
 *
 * Every line still describes something the product does today: no ratings, logos or
 * percentages until there are real ones. Calls to action carry `data-track` so the analytics
 * tag (components/Analytics) can tell which door people take.
 */
export default async function Home() {
  const { events, rooms, topics } = await directory();

  return (
    <div className="flex flex-1 flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero: the promise and the search */}
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
          <div>
            <h1 className="text-balance text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl">Join live conversations that matter</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted sm:text-xl">Find a room, meet people who care about the same things, and join the next live session.</p>
            <form action="/explore" method="get" role="search" className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
              <input type="hidden" name="view" value="rooms" />
              <Input name="q" placeholder="Search topics like careers, AI, business…" aria-label="Search topics" className="h-12 flex-1 text-base" />
              <Button type="submit" size="lg" data-track="hero_find_room">
                Find a room
              </Button>
            </form>
            <p className="mt-6 text-sm text-ink-muted">
              Already registered for an event?{" "}
              <Link href="/join" className="font-medium text-brand underline-offset-4 hover:text-brand-hover hover:underline" data-track="hero_join_code">
                Join with your email and code
              </Link>
              , or open the personal link from your welcome email.
            </p>
          </div>
          {/* The room, in an espresso frame so the cream inside it has an edge against the cream page; its top sits on the headline's cap height. */}
          <figure className="mx-auto w-full max-w-xl rounded-2xl bg-espresso p-2 shadow-float sm:p-3 lg:mt-2 lg:max-w-none">
            <Image src={liveRoom} alt="A live session on Tertulia: a slide with the host on camera in the corner, reactions floating up, a Raise hand button, and the Chat and Q&A panel" priority sizes="(min-width: 1024px) 560px, 100vw" className="rounded-lg" />
          </figure>
        </section>

        {/* Happening soon: the directory, live */}
        <Section id="events" title="Happening soon" href="/explore" link="See all events">
          {events.length === 0 ? (
            <EmptyState
              className="mt-8"
              title="No events yet. Be the first to open a room."
              description="Hosts list a session by ticking List on Explore when they create it. Browse the rooms, or open your own."
              action={
                <ButtonLink href="/for-hosts" variant="secondary" size="sm" data-track="events_empty_host">
                  Host an event
                </ButtonLink>
              }
            />
          ) : (
            <ul className="-mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
              {events.map((e) => (
                <EventCard key={e.id} event={e} className="w-[82vw] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none" />
              ))}
            </ul>
          )}
        </Section>

        {/* Browse by topic */}
        {topics.length > 0 && (
          <Section id="topics" title="Browse by topic" href="/explore?view=rooms" link="All rooms">
            <TopicTiles topics={topics} className="mt-8" />
          </Section>
        )}

        {/* Featured rooms */}
        <Section id="rooms" title="Featured rooms" href="/explore?view=rooms" link="Browse all rooms">
          {rooms.length === 0 ? (
            <EmptyState className="mt-8" title="No rooms listed yet" description="A room appears here once its host lists it from the room's Settings tab. Yours could be the first." action={<ButtonLink href="/for-hosts" variant="secondary" size="sm" data-track="rooms_empty_host">Open your own room</ButtonLink>} />
          ) : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </ul>
          )}
        </Section>

        {/* How it works, for someone joining */}
        <Section id="how" title="How it works" body="Three steps from curious to in the room. Nothing to install, no account to make.">
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            <Step n={1} title="Find a room" body="Search by topic or browse what is listed. Every room has a public page with what it is about, who hosts it and what is coming up." />
            <Step n={2} title="Join the next session" body="Pick an event and register with a name and an email, nothing else. A welcome email brings your personal link and a join code." />
            <Step n={3} title="Take part" body="Open your link when the doors open. See and hear the host, answer polls on the slide, chat, ask questions, react, and raise a hand to come on stage." />
          </ol>
        </Section>

        {/* Host band: the invitation, with a host's waiting room beside it */}
        <section className="bg-espresso text-cream">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_minmax(0,26rem)] lg:gap-16 lg:py-20">
            <div>
              <h2 className="text-3xl tracking-tight text-cream sm:text-4xl">Run live sessions? Open your own room.</h2>
              <p className="mt-3 max-w-xl text-lg text-cream/75">Your events, your people and your audience insights in one place. Your look, down to the waiting room and the music. Free to start.</p>
              <ButtonLink href="/for-hosts" size="lg" className="mt-8 w-full sm:w-auto" data-track="band_host_event">
                Host an event
              </ButtonLink>
            </div>
            <figure>
              <Image src={waitingRoom} alt="A room's waiting room: the host's café photo behind a card that reads Starting soon, hosted by Elena Vance, with music playing" sizes="(min-width: 1024px) 416px, 100vw" className="rounded-xl shadow-overlay" />
              <figcaption className="mt-3 text-sm text-cream/60">A host&apos;s waiting room, the way attendees see it before the doors open.</figcaption>
            </figure>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

/**
 * What the directory has to show on the front door: the next public events, the most active
 * listed rooms and the topics in use. The home page must render for anyone, so a directory
 * that cannot be reached (no database configured, an outage) shows the empty states rather
 * than an error.
 */
async function directory(): Promise<{ events: PublicEvent[]; rooms: PublicRoom[]; topics: { topic: string; rooms: number }[] }> {
  try {
    const [events, rooms, topics] = await Promise.all([listPublicEvents({}, 6), listPublicRooms({}, 3), listTopics()]);
    return { events, rooms, topics: topics.slice(0, 8) };
  } catch {
    return { events: [], rooms: [], topics: [] };
  }
}

/** A section of the page: a heading, an optional sentence, an optional link to the right, then the content. */
function Section({ id, title, body, href, link, children }: { id: string; title: string; body?: string; href?: string; link?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className={cx("flex flex-wrap gap-4", "items-end justify-between")}>
          <div className="max-w-2xl">
            <h2 className="text-3xl tracking-tight text-ink sm:text-4xl">{title}</h2>
            {body && <p className="mt-3 text-lg leading-relaxed text-ink-muted">{body}</p>}
          </div>
          {href && link && (
            <Link href={href} className="text-sm font-semibold text-brand underline-offset-4 hover:text-brand-hover hover:underline">
              {link} →
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4 rounded-xl bg-surface-raised p-6 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-heading text-xl text-white" aria-hidden>
        {n}
      </span>
      <div>
        <h3 className="text-2xl leading-tight text-ink">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  );
}
