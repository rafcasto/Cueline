import Link from "next/link";
import type { ReactNode } from "react";
import { EventCard, RoomCard, TopicChips } from "@/components/ExploreCards";
import { Button, ButtonLink, EmptyState, Input, Logo, cx } from "@/components/ui";
import { listPublicEvents, listPublicRooms, listTopics, type PublicEvent, type PublicRoom } from "@/lib/explore";
import { PLAN_LIMITS, PRICE_LABELS, type Plan, type PlanLimits } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Landing page, on the Meetup pattern and with Meetup's restraint: a white page, one big
 * promise, a search box, then what is actually happening (upcoming public events and the
 * communities running them, read live from the directory), how it works, an invitation to
 * organise, the plans, and a slim footer. Whitespace and type carry the hierarchy; there are
 * no gradients, badges, eyebrow labels or illustrated product mocks, and sections are parted
 * by a hairline inside the column rather than by alternating panels. Every line still
 * describes something the product does today: no ratings, logos or percentages until there
 * are real ones.
 *
 * The plans read from PLAN_LIMITS so the page never drifts from the gates, and list only the
 * limits the app enforces and the features a host can reach from the product. Recordings are
 * made on the paid plans but nothing shows them to the host yet, the stage and the branding
 * are not gated by plan, and the Stripe call to action settles into Tertulia's own account,
 * so none of those is sold here until it is true. Three plain columns, Starter with the only
 * primary button; what every plan shares is said once above the columns, and each column
 * lists only what sets it apart.
 *
 * Attendees also land here from a bookmark, so the typed door (email + code) stays reachable
 * from the header, the hero and the footer. Calls to action carry `data-track` so the
 * analytics tag (components/Analytics) can tell which door people take.
 */
export default async function Home() {
  const { events, rooms, topics } = await directory();

  return (
    <div className="flex flex-1 flex-col bg-surface">
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Tertulia home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-ink-muted md:flex" aria-label="Primary">
            <Link href="/explore" className="hover:text-ink">
              Events
            </Link>
            <Link href="/explore?view=rooms" className="hover:text-ink">
              Communities
            </Link>
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#pricing" className="hover:text-ink">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/join" className="hidden text-sm font-medium text-ink-muted hover:text-ink sm:inline">
              Join with a code
            </Link>
            <ButtonLink href="/login" size="sm" data-track="header_start_community">
              Start a community
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: the promise and the search */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16 lg:pb-24 lg:pt-24">
          <div>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-ink sm:text-6xl xl:text-7xl">
              Find your people.
              <br />
              Show up live.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted sm:text-xl">
              Talks, workshops, classes and open conversations you join from any browser. Register with a name and an email. Nothing to install, no account to make.
            </p>
            <form action="/explore" method="get" role="search" className="mt-8 flex max-w-lg gap-2">
              <Input name="q" placeholder="Search events and communities" aria-label="Search events and communities" className="h-12 flex-1 text-base" />
              <Button type="submit" size="lg" data-track="hero_search">
                Search
              </Button>
            </form>
            {topics.length > 0 && <TopicChips topics={topics} className="mt-4" />}
            <p className="mt-8 text-sm text-ink-muted">
              Already registered?{" "}
              <Link href="/join" className="font-medium text-ink underline-offset-4 hover:underline" data-track="hero_join_code">
                Join with your email and code
              </Link>
              , or open the personal link from your welcome email.
            </p>
          </div>
          <HeroArt className="mx-auto w-full max-w-sm lg:max-w-none" />
        </section>

        {/* Happening soon: the directory, live */}
        <Section id="events" title="Happening soon" body="Public sessions across every listed community. Register in one tap; your welcome email carries your way in." href="/explore" link="See all events">
          {events.length === 0 ? (
            <EmptyState
              className="mt-10"
              title="No public events listed yet"
              description="Organisers list a session by ticking List on Explore when they create it. Browse the communities, or be the first to put one up."
              action={
                <Link href="/explore?view=rooms" className="text-sm font-medium text-ink underline-offset-4 hover:underline">
                  Browse communities
                </Link>
              }
            />
          ) : (
            <ul className="mt-10 grid gap-4 lg:grid-cols-2">
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </ul>
          )}
        </Section>

        {/* Communities to join */}
        <Section id="communities" title="Communities to join" body="Each one is a standing room with its own organisers, events and people." href="/explore?view=rooms" link="Browse all communities">
          {rooms.length === 0 ? (
            <EmptyState
              className="mt-10"
              title="No communities listed yet"
              description="A community appears here once its organiser lists it from the room's Settings tab. Yours could be the first."
              action={
                <Link href="/login" className="text-sm font-medium text-ink underline-offset-4 hover:underline" data-track="communities_empty_start">
                  Start a community
                </Link>
              }
            />
          ) : (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </ul>
          )}
          {topics.length > 0 && (
            <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
              <span>Browse by topic</span>
              <TopicChips topics={topics} base="/explore?view=rooms" />
            </div>
          )}
        </Section>

        {/* How it works, for someone joining */}
        <Section id="how" title="How Tertulia works" body="Three steps from curious to in the room." centered>
          <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
            <Step n={1} title="Find a community" body="Search by topic or browse what is listed. Every community has a public page with what it is about, who runs it and what is coming up." href="/explore?view=rooms" link="Browse communities" />
            <Step n={2} title="Register for an event" body="Pick a session and register with a name and an email, nothing else. A welcome email brings your personal link and a join code; many communities send reminders before the start too." href="/explore" link="See upcoming events" />
            <Step n={3} title="Show up live" body="Open your link when the doors open. See and hear the organisers, answer the polls and quizzes on the slide, chat, ask questions, react, and raise a hand to come on stage." href="/join" link="Join with a code" />
          </ol>
        </Section>

        {/* Together in the session */}
        <Section id="together" title="A session you take part in, not a stream you watch" body="Every activity opens over the slide everyone is looking at, with a timer if the organiser wants one, and the results reveal when they say so.">
          <ul className="mt-8 flex flex-wrap gap-2" aria-label="What members can do in a session">
            {["Polls", "Quizzes with scores", "Word clouds", "Live chat", "Q&A with upvotes", "Reactions", "Raise hand", "Come on stage"].map((t) => (
              <li key={t} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink">
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            <Feature title="Answer on the slide" body="Polls, quizzes and word clouds appear over the deck as the organiser launches them. Tap an answer or type a word; the tally, the cloud or the leaderboard appears as the reveal." />
            <Feature title="Talk to the room" body="Chat with everyone while the doors are open and during the session. Ask a question, upvote the ones you want answered, and watch the organiser mark them answered." />
            <Feature title="Be seen, if you want to" body="Six reactions float across every screen. Raise a hand and the organiser can bring you on stage, camera and all, in about a second." />
          </div>
        </Section>

        {/* Organise a community */}
        <section id="organise" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <div className="rounded-3xl bg-brand-soft px-6 py-14 sm:px-12 sm:py-20 lg:grid lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Start a community people come back to</h2>
                <p className="mt-4 text-lg leading-relaxed text-ink-muted">
                  A community on Tertulia is a room you own: your colour and logo, your events and your people in one place. List it and anyone can find it; every event you publish is a registration page too.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <ButtonLink href="/login" size="lg" className="w-full sm:w-auto" data-track="organise_start_community">
                    Start a community
                  </ButtonLink>
                  <a href="#pricing" className="inline-flex h-12 items-center justify-center px-2 text-base font-medium text-ink underline-offset-4 hover:underline">
                    See the plans
                  </a>
                </div>
                <p className="mt-4 text-sm text-ink-muted">Free to start, no card. The weekly organiser is on Starter at {PRICE_LABELS.starter_monthly.amount} a month.</p>
              </div>
              <ul className="mt-10 space-y-4 text-base text-ink lg:mt-0">
                <Check>A public page with your description, topics, upcoming and past events</Check>
                <Check>Members register with a name and an email and get a welcome email; reminders follow on the paid plans</Check>
                <Check>Seats per event, and a waiting list when they are gone</Check>
                <Check>Polls, quizzes, word clouds and calls to action over your slides</Check>
                <Check>Who registered against who actually turned up</Check>
                <Check>Your accent colour and logo on the room and every button in it</Check>
              </ul>
            </div>
          </div>
        </section>

        {/* Plans */}
        <Section id="pricing" title="Pay for the room you run, not for the people in it" body="Attendees never pay. Every plan has polls, quizzes, word clouds, chat and Q&A on the slide, raised hands and a stage, seats and a waiting list per event, your colour and logo, and a welcome email on registration. The plans differ in how often, how many and how long." centered>
          <ul className="mx-auto mt-14 grid max-w-5xl gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
            <PlanCard plan="free" blurb="A trial of the whole engagement layer: one real quiz with a timer and a reveal." price="$0" per="forever" note="No card. Go live today." cta="Start free" href="/login" variant="secondary" />
            <PlanCard
              plan="starter"
              featured
              blurb="The weekly organiser: a full room, two-hour sessions and reminders that ask the no-shows to free their seat."
              price={PRICE_LABELS.starter_monthly.amount}
              per="a month"
              note={`Or ${PRICE_LABELS.starter_yearly.amount} a year, two months free.`}
              cta="Start with Starter"
              href="/login?next=/host/billing"
              variant="primary"
            />
            <PlanCard
              plan="pro"
              blurb="Several sessions a week, a bigger room and longer sessions."
              price={PRICE_LABELS.pro_monthly.amount}
              per="a month"
              note={`Or ${PRICE_LABELS.pro_yearly.amount} a year, two months free.`}
              cta="Go Pro"
              href="/login?next=/host/billing"
              variant="secondary"
            />
          </ul>
          <p className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-ink-muted">
            A plan is per room: your first room is free until you upgrade it, and every further room is its own Starter or Pro subscription. Prices in USD, billed through Stripe. Move up or down whenever you like; the difference is prorated, and cancelling takes effect at the end of the period you have paid for. A session counts the moment you press <em>Go live</em>; a false start nobody joined is given back. Pro is unlimited in count within a fair-use line of {PLAN_LIMITS.pro.poolParticipantHours} participant-hours a month. Tertulia runs on a single video server today, so there is no uptime guarantee on any plan yet.
          </p>
        </Section>

        {/* Closing CTA */}
        <section>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="border-t border-line py-20 text-center sm:py-28">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">Your next session is a browser tab away</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">Join a community and register for what is coming up, or start one of your own.</p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink href="/explore" size="lg" className="w-full sm:w-auto" data-track="closing_find_event">
                  Find an event
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary" size="lg" className="w-full sm:w-auto" data-track="closing_start_community">
                  Start a community
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-6 border-t border-line py-10 sm:flex-row sm:items-center sm:justify-between">
            <Logo />
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted" aria-label="Footer">
              <Link href="/explore" className="hover:text-ink">
                Events
              </Link>
              <Link href="/explore?view=rooms" className="hover:text-ink">
                Communities
              </Link>
              <a href="#pricing" className="hover:text-ink">
                Pricing
              </a>
              <Link href="/join" className="hover:text-ink">
                Join with a code
              </Link>
              <Link href="/login" className="hover:text-ink">
                Host sign in
              </Link>
            </nav>
            <p className="text-sm text-ink-faint">© {new Date().getFullYear()} Tertulia</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * What the directory has to show on the front door: the next public events, the most active
 * listed communities and the topics in use. The landing page must render for anyone, so a
 * directory that cannot be reached (no database configured, an outage) shows the empty states
 * rather than an error.
 */
async function directory(): Promise<{ events: PublicEvent[]; rooms: PublicRoom[]; topics: string[] }> {
  try {
    const [events, rooms, topics] = await Promise.all([listPublicEvents({}, 6), listPublicRooms({}, 6), listTopics()]);
    return { events, rooms, topics: topics.slice(0, 8).map((t) => t.topic) };
  } catch {
    return { events: [], rooms: [], topics: [] };
  }
}

/** A section of the page: a hairline inside the column, a heading, a sentence, an optional link, then the content. */
function Section({ id, title, body, href, link, centered, children }: { id: string; title: string; body?: string; href?: string; link?: string; centered?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-t border-line py-16 sm:py-24">
          <div className={cx("flex flex-wrap gap-4", centered ? "flex-col items-center text-center" : "items-end justify-between")}>
            <div className={cx("max-w-2xl", centered && "mx-auto")}>
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
              {body && <p className="mt-3 text-lg leading-relaxed text-ink-muted">{body}</p>}
            </div>
            {href && link && (
              <Link href={href} className="text-sm font-medium text-ink underline-offset-4 hover:underline">
                {link} →
              </Link>
            )}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, body, href, link }: { n: number; title: string; body: string; href: string; link: string }) {
  return (
    <li className="flex flex-col text-left md:text-center">
      <span className="text-sm font-semibold text-brand">{n}</span>
      <h3 className="mt-2 text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-3 flex-1 text-base leading-relaxed text-ink-muted">{body}</p>
      <Link href={href} className="mt-4 text-sm font-medium text-ink underline-offset-4 hover:underline">
        {link} →
      </Link>
    </li>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-base leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

/**
 * What sets a plan apart, in the order an organiser weighs it: how often, how many, how long,
 * then the reminders. Read from PLAN_LIMITS so the page and the gates never disagree, and
 * limited to what the app enforces today (the session, participant and length caps, and the
 * reminder gate). The recording, stage-slot, fallback-stream and Stripe flags in PLAN_LIMITS
 * are not listed: see the note at the top of this file. What every plan shares is said once
 * above the columns, so a column lists only what it has.
 */
function planLines(l: PlanLimits): string[] {
  const sessions = l.sessionsPerMonth === null ? "Unlimited sessions" : l.sessionsPerMonth === 1 ? "1 session a month" : `${l.sessionsPerMonth} sessions a month`;
  const length = l.minutes >= 60 ? `${l.minutes / 60} hours per session` : `${l.minutes} minutes per session`;
  const lines = [sessions, `${l.participants} attendees per session`, length];
  if (l.reminders) lines.push("Reminder emails before every event");
  return lines;
}

function PlanCard({ plan, featured, blurb, price, per, note, cta, href, variant }: { plan: Plan; featured?: boolean; blurb: string; price: string; per: string; note: string; cta: string; href: string; variant: "primary" | "secondary" }) {
  const l = PLAN_LIMITS[plan];
  return (
    <li className="flex flex-col md:px-8 md:first:pl-0 md:last:pr-0">
      <h3 className="text-lg font-semibold text-ink">{l.label}</h3>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight text-ink">{price}</span>
        <span className="text-sm text-ink-muted">{per}</span>
      </p>
      <p className="mt-1 text-sm text-ink-muted">{note}</p>
      <p className="mt-5 text-base leading-relaxed text-ink-muted">{blurb}</p>
      <ButtonLink href={href} variant={variant} size="lg" className="mt-8 w-full" data-track={`pricing_${plan}`}>
        {cta}
      </ButtonLink>
      {featured && <p className="mt-2 text-center text-xs text-ink-muted">For the weekly organiser</p>}
      <ul className="mt-8 space-y-3 text-sm text-ink">
        {planLines(l).map((line) => (
          <li key={line} className="flex items-start gap-3">
            <Tick />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Tick className="mt-1" />
      <span>{children}</span>
    </li>
  );
}

function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cx("mt-0.5 size-4 shrink-0 text-brand", className)}>
      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The room in a few flat shapes: a slide, a poll mid-vote over it, the organiser on camera,
 * reactions floating up and the people in the room along the bottom. Drawn in the page's own
 * colour variables so it follows the theme, and inline so there is no image to load.
 */
function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" className={className} role="img" aria-label="A live session: a slide with a poll over it, the organiser on camera, and reactions floating up">
      <defs>
        <clipPath id="hero-camera">
          <circle cx="388" cy="222" r="46" />
        </clipPath>
      </defs>
      {/* the slide */}
      <rect x="24" y="24" width="432" height="272" rx="24" fill="var(--brand-soft)" />
      <rect x="60" y="64" width="176" height="14" rx="7" fill="var(--ink)" opacity="0.8" />
      <rect x="60" y="92" width="112" height="8" rx="4" fill="var(--ink)" opacity="0.25" />
      {/* live */}
      <rect x="376" y="58" width="56" height="24" rx="12" fill="#dc2626" />
      <circle cx="390" cy="70" r="3.5" fill="#ffffff" />
      <text x="399" y="74.5" fontSize="11" fontWeight="700" fill="#ffffff" letterSpacing="0.5">
        LIVE
      </text>
      {/* the poll */}
      <rect x="60" y="128" width="256" height="136" rx="16" fill="var(--surface-raised)" />
      <rect x="80" y="150" width="144" height="10" rx="5" fill="var(--ink)" opacity="0.75" />
      <rect x="80" y="176" width="196" height="14" rx="7" fill="var(--brand)" />
      <rect x="80" y="202" width="128" height="14" rx="7" fill="var(--brand)" opacity="0.45" />
      <rect x="80" y="228" width="88" height="14" rx="7" fill="var(--brand)" opacity="0.22" />
      {/* the organiser on camera */}
      <circle cx="388" cy="222" r="46" fill="var(--brand)" />
      <g clipPath="url(#hero-camera)" fill="var(--brand-contrast)" opacity="0.92">
        <circle cx="388" cy="208" r="15" />
        <circle cx="388" cy="262" r="30" />
      </g>
      {/* reactions floating up */}
      <circle cx="340" cy="296" r="10" fill="var(--brand)" opacity="0.9" />
      <circle cx="326" cy="270" r="7" fill="var(--brand)" opacity="0.5" />
      <circle cx="338" cy="248" r="5" fill="var(--brand)" opacity="0.28" />
      {/* the people in the room */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={64 + i * 30} cy="328" r="9" fill="var(--ink)" opacity={0.75 - i * 0.1} />
      ))}
      <text x="250" y="332.5" fontSize="12" fontWeight="600" fill="var(--ink-muted)">
        128 here
      </text>
    </svg>
  );
}
