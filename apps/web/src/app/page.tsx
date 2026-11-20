import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/AppShell";
import { EventCard, RoomCard, TopicTiles } from "@/components/ExploreCards";
import { Button, ButtonLink, EmptyState, Input, cx } from "@/components/ui";
import { listPublicEvents, listPublicRooms, listTopics, type PublicEvent, type PublicRoom } from "@/lib/explore";

export const dynamic = "force-dynamic";

/**
 * The home page serves attendees: most visitors arrive from an event link, so it is "Join a
 * room" from top to bottom (docs/BRAND.md, Website). A warm hero with a topic search, then
 * what is actually happening (the next public events and the rooms running them, read live
 * from the directory), topics to browse, how joining works, one espresso band that sends
 * hosts to /for-hosts (the page that does the selling), and the footer. Cream page, white
 * cards, terracotta for the big marks only, teal for anything you can click.
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
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
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
              <Link href="/join" className="font-semibold text-brand underline-offset-4 hover:text-brand-hover hover:underline" data-track="hero_join_code">
                Join with your email and code
              </Link>
              , or open the personal link from your welcome email.
            </p>
          </div>
          <HeroArt className="mx-auto w-full max-w-sm lg:max-w-none" />
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

        {/* Host band */}
        <section className="bg-espresso text-cream">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:py-20">
            <div>
              <h2 className="text-3xl tracking-tight text-cream sm:text-4xl">Run live sessions? Open your own room.</h2>
              <p className="mt-3 max-w-xl text-lg text-cream/75">Your events, your people and your audience insights in one place. Free to start.</p>
            </div>
            <ButtonLink href="/for-hosts" size="lg" className="w-full shrink-0 sm:w-auto" data-track="band_host_event">
              Host an event
            </ButtonLink>
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

/**
 * The hero illustration: a terracotta organic shape with a table of people in conversation,
 * their speech bubbles, and a few reactions floating up. Drawn in the brand colours and inline,
 * so there is no image to load; a warm photograph of people talking can take its place later.
 */
function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 420" className={className} role="img" aria-label="People around a table in conversation, with speech bubbles and reactions floating up">
      {/* the organic shape */}
      <path d="M86 44C168 -8 322 10 398 66c70 52 94 160 56 236-38 76-130 118-224 106C136 396 44 344 26 262 12 196 24 84 86 44z" fill="var(--accent)" />
      {/* the table */}
      <ellipse cx="240" cy="318" rx="150" ry="26" fill="var(--espresso)" opacity="0.28" />
      <ellipse cx="240" cy="306" rx="150" ry="26" fill="var(--cream)" />
      {/* cups on the table */}
      <g fill="var(--espresso)">
        <rect x="178" y="286" width="22" height="18" rx="4" />
        <path d="M200 290h5a5 5 0 0 1 0 10h-5z" fill="none" stroke="var(--espresso)" strokeWidth="2.5" />
        <rect x="286" y="288" width="22" height="18" rx="4" />
        <path d="M308 292h5a5 5 0 0 1 0 10h-5z" fill="none" stroke="var(--espresso)" strokeWidth="2.5" />
      </g>
      {/* three people */}
      <g fill="var(--cream)">
        <circle cx="140" cy="222" r="28" />
        <path d="M86 300c0-36 24-56 54-56s54 20 54 56z" />
      </g>
      <g fill="var(--espresso)">
        <circle cx="240" cy="200" r="30" />
        <path d="M182 290c0-40 26-62 58-62s58 22 58 62z" />
      </g>
      <g fill="var(--cream)">
        <circle cx="342" cy="226" r="28" />
        <path d="M288 302c0-36 24-56 54-56s54 20 54 56z" />
      </g>
      {/* speech bubbles */}
      <g>
        <path d="M58 132a16 16 0 0 1 16-16h92a16 16 0 0 1 16 16v30a16 16 0 0 1-16 16h-56l-22 18v-18H74a16 16 0 0 1-16-16z" fill="var(--cream)" />
        <rect x="76" y="134" width="68" height="8" rx="4" fill="var(--espresso)" opacity="0.8" />
        <rect x="76" y="150" width="44" height="8" rx="4" fill="var(--espresso)" opacity="0.35" />
      </g>
      <g>
        <path d="M296 92a16 16 0 0 1 16-16h98a16 16 0 0 1 16 16v30a16 16 0 0 1-16 16h-16v18l-22-18h-60a16 16 0 0 1-16-16z" fill="var(--espresso)" />
        <rect x="314" y="94" width="72" height="8" rx="4" fill="var(--cream)" opacity="0.9" />
        <rect x="314" y="110" width="48" height="8" rx="4" fill="var(--cream)" opacity="0.45" />
      </g>
      {/* reactions floating up */}
      <g fill="var(--live)">
        <path d="M232 70c-6-10-22-8-22 6 0 10 12 18 22 26 10-8 22-16 22-26 0-14-16-16-22-6z" />
      </g>
      <circle cx="268" cy="54" r="7" fill="#f2b233" />
      <circle cx="210" cy="46" r="5" fill="var(--cream)" opacity="0.8" />
      {/* LIVE */}
      <rect x="28" y="356" width="68" height="26" rx="13" fill="var(--live)" />
      <circle cx="44" cy="369" r="3.5" fill="#ffffff" />
      <text x="54" y="373.5" fontSize="12" fontWeight="700" fill="#ffffff" letterSpacing="0.6">
        LIVE
      </text>
    </svg>
  );
}
