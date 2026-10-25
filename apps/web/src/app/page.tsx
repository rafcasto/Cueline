import Link from "next/link";
import type { CSSProperties } from "react";
import { EventCard, RoomCard, TopicChips } from "@/components/ExploreCards";
import { Badge, Button, ButtonLink, EmptyState, Input, Logo, cx } from "@/components/ui";
import { listPublicEvents, listPublicRooms, listTopics, type PublicEvent, type PublicRoom } from "@/lib/explore";
import { PLAN_LIMITS, PRICE_LABELS, type Plan, type PlanLimits } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Landing page, built the way Meetup's front door is: a promise about people and a search box
 * first, then what is actually happening (upcoming public events and the communities running
 * them, read live from the directory), how it works for someone joining and for someone
 * organising, the plans, and a closing invitation to start a community. Every line still
 * describes something the product does today: no ratings, logos or percentages until there are
 * real ones.
 *
 * The plans section is built to move an organiser from Free to Starter without hiding anything:
 * three tiers read from PLAN_LIMITS so the page never drifts from the gates (good-better-best,
 * with Pro as the anchor on the right), Starter carries the only primary button and the only
 * raised card (the default effect), Free is shown as the trial it is, with its limits in plain
 * words next to Starter's (contrast), the price is restated per day and per year (mental
 * accounting), and the proration and cancel-any-time line sits under the cards so there is no
 * regret to fear. Nothing is scarce or urgent because nothing is.
 *
 * Attendees also land here from a bookmark, so the typed door (email + code) stays reachable
 * from the header, the hero and the footer.
 */
export default async function Home() {
  const { events, rooms, topics } = await directory();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-surface-sunken/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Tertulia home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-muted md:flex" aria-label="Primary">
            <Link href="/explore" className="hover:text-ink">
              Events
            </Link>
            <Link href="/explore?view=rooms" className="hover:text-ink">
              Communities
            </Link>
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#organise" className="hover:text-ink">
              Organise
            </a>
            <a href="#pricing" className="hover:text-ink">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/join" className="hidden text-sm font-medium text-ink-muted hover:text-ink sm:inline">
              Join with a code
            </Link>
            <ButtonLink href="/login" size="sm">
              Start a community
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: the promise and the search */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--brand-soft),transparent_70%)]" />
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">Live communities, in the browser</p>
              <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
                Find your people. <em className="not-italic text-brand">Show up live.</em>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
                Tertulia is where communities gather for live sessions: talks, workshops, classes and open conversations you join from any browser. Register with a name and an email, no download and no account, and take part from the first minute.
              </p>

              <form action="/explore" method="get" role="search" className="mx-auto mt-8 flex max-w-xl gap-2">
                <Input name="q" placeholder="Search events and communities" aria-label="Search events and communities" className="h-12 flex-1 text-base" />
                <Button type="submit" size="lg">
                  Search
                </Button>
              </form>
              {topics.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-ink-muted">
                  <span>Popular:</span>
                  <TopicChips topics={topics} className="justify-center" />
                </div>
              )}

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink href="/explore" size="lg" className="w-full sm:w-auto">
                  Find an event
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary" size="lg" className="w-full sm:w-auto">
                  Start a community
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-ink-muted">
                Already registered for a session?{" "}
                <Link href="/join" className="font-medium text-brand hover:underline">
                  Join with your email and code
                </Link>
                , or open the personal link from your welcome email.
              </p>
            </div>
          </div>
        </section>

        {/* Happening soon: the directory, live */}
        <section id="events" className="border-t border-line bg-surface-raised scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <SectionHeading title="Happening soon" body="Public sessions across every listed community. Register in one tap; the organiser's reminders do the rest." href="/explore" link="See all events" />
            {events.length === 0 ? (
              <EmptyState
                className="mt-8"
                title="No public events listed yet"
                description="Organisers list a session by ticking List on Explore when they create it. Browse the communities, or be the first to put one up."
                action={
                  <Link href="/explore?view=rooms" className="text-sm font-medium text-brand hover:underline">
                    Browse communities
                  </Link>
                }
              />
            ) : (
              <ul className="mt-8 grid gap-4 lg:grid-cols-2">
                {events.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Communities to join */}
        <section id="communities" className="border-t border-line scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <SectionHeading title="Communities to join" body="Each one is a standing room with its own organisers, events, people and recordings. Follow the ones you care about and come back for the next session." href="/explore?view=rooms" link="Browse all communities" />
            {rooms.length === 0 ? (
              <EmptyState
                className="mt-8"
                title="No communities listed yet"
                description="A community appears here once its organiser lists it from the room's Settings tab. Yours could be the first."
                action={
                  <Link href="/login" className="text-sm font-medium text-brand hover:underline">
                    Start a community
                  </Link>
                }
              />
            ) : (
              <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.map((r) => (
                  <RoomCard key={r.id} room={r} />
                ))}
              </ul>
            )}
            {topics.length > 0 && (
              <div className="mt-10">
                <h3 className="text-sm font-semibold text-ink">Browse by topic</h3>
                <TopicChips topics={topics} className="mt-3" base="/explore?view=rooms" />
              </div>
            )}
          </div>
        </section>

        {/* How it works, for someone joining */}
        <section id="how" className="border-t border-line bg-surface-raised scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">How Tertulia works</h2>
              <p className="mt-3 text-lg text-ink-muted">Three steps from curious to in the room. Nothing to install, nothing to sign up for.</p>
            </div>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              <HowCard n="1" title="Find a community" body="Search by topic or browse what is listed. Every community has a public page with what it is about, who is organising it, what is coming up and what it has run before." href="/explore?view=rooms" link="Browse communities" />
              <HowCard n="2" title="Register for an event" body="Pick a session and register with a name and an email, nothing else. A welcome email brings your personal link and a join code, and reminders arrive before the start." href="/explore" link="See upcoming events" />
              <HowCard n="3" title="Show up live" body="Open your link when the doors open. You see and hear the organisers, answer the polls and quizzes on the slide, chat, ask questions, react, and raise a hand to be brought on stage." href="/join" link="Join with a code" />
            </ol>
          </div>
        </section>

        {/* Together in the session */}
        <section id="together" className="border-t border-line scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">A session you take part in, not a stream you watch</h2>
              <p className="mt-3 text-lg text-ink-muted">Every activity opens over the slide everyone is looking at, with a timer if the organiser wants one, and the results reveal when they say so.</p>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="What members can do in a session">
              {["Polls", "Quizzes with scores", "Word clouds", "Live chat", "Q&A with upvotes", "Reactions", "Raise hand", "Come on stage", "Recordings"].map((t) => (
                <li key={t}>
                  <Badge tone="brand" className="px-3 py-1 text-sm">
                    {t}
                  </Badge>
                </li>
              ))}
            </ul>
            <RoomMock className="mx-auto mt-10 max-w-4xl" />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <Feature title="Answer on the slide" body="Polls, quizzes and word clouds appear over the deck as the organiser launches them. Tap an answer or type a word; the tally, the cloud or the leaderboard appears as the reveal." />
              <Feature title="Talk to the room" body="Chat with everyone while the doors are open and during the session. Ask a question, upvote the ones you want answered, and watch the organiser mark them answered." />
              <Feature title="Be seen, if you want to" body="Six reactions float across every screen. Raise a hand and the organiser can bring you on stage, camera and all, in about a second." />
            </div>
          </div>
        </section>

        {/* Organise a community */}
        <section id="organise" className="border-t border-line bg-surface-raised scroll-mt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">For organisers</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Start a community people come back to</h2>
              <p className="mt-3 text-lg text-ink-muted">
                A community on Tertulia is a room you own: your colour and logo, your events, your people and your recordings in one place. List it on Explore and anyone can find it; every event you publish there is a registration page too.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink">
                <Check>A public page with your description, topics, upcoming and past events</Check>
                <Check>Events that double as invite links; members register with a name and an email</Check>
                <Check>A welcome email and four reminders per room, edited once and inherited by every event</Check>
                <Check>Polls, quizzes, word clouds and calls to action over your slides, with timers and reveals</Check>
                <Check>Who registered against who joined, and a recording of every session</Check>
                <Check>Your accent colour and logo on the room, the invite page and every button in it</Check>
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/login" size="lg" className="w-full sm:w-auto">
                  Start a community
                </ButtonLink>
                <ButtonLink href="#pricing" variant="secondary" size="lg" className="w-full sm:w-auto">
                  See the plans
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-ink-muted">
                Free to start: one short session a month to try the whole engagement layer. The weekly organiser is on Starter at {PRICE_LABELS.starter_monthly.amount} a month.
              </p>
            </div>
            <BrandMock />
          </div>
        </section>

        {/* Plans */}
        <section id="pricing" className="border-t border-line scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">Plans for organisers</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Pay for the room you run, not for the people in it</h2>
              <p className="mt-3 text-lg text-ink-muted">Attendees never pay. You pay a flat monthly fee for the audience size, the session length and the recording; everything on the slide is in every plan.</p>
            </div>
            <ul className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3 lg:items-start">
              <PlanCard
                plan="free"
                blurb="A trial of the whole engagement layer: run one real quiz with a timer and a reveal."
                price="$0"
                per="forever"
                note="No card. Go live today."
                cta="Start free"
                href="/login"
                variant="secondary"
              />
              <PlanCard
                plan="starter"
                featured
                blurb="The weekly organiser: a full room, a two-hour session and a recording to send afterwards."
                price={PRICE_LABELS.starter_monthly.amount}
                per="a month"
                note={`Under a dollar a day. Or ${PRICE_LABELS.starter_yearly.amount} a year, two months free.`}
                cta="Start with Starter"
                href="/login?next=/host/billing"
                variant="primary"
              />
              <PlanCard
                plan="pro"
                blurb="Several sessions a week, a bigger room, longer sessions, and a checkout on the slide."
                price={PRICE_LABELS.pro_monthly.amount}
                per="a month"
                note={`Or ${PRICE_LABELS.pro_yearly.amount} a year, two months free.`}
                cta="Go Pro"
                href="/login?next=/host/billing"
                variant="secondary"
              />
            </ul>
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-muted">
              Prices in USD, billed through Stripe. Move up or down from your billing page whenever you like; the difference is prorated, and cancelling takes effect at the end of the period you have paid for. A session counts the moment you press <em>Go live</em>; a false start nobody joined is given back.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-line bg-surface-raised">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Your next session is a browser tab away</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-ink-muted">Join a community and register for what is coming up, or start one of your own and invite the people you want in the room.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/explore" size="lg" className="w-full sm:w-auto">
                Find an event
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" size="lg" className="w-full sm:w-auto">
                Start a community
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              Organisers start free; the weekly room is{" "}
              <a href="#pricing" className="font-medium text-brand hover:underline">
                Starter at {PRICE_LABELS.starter_monthly.amount} a month
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface-raised">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">Live communities in the browser. Find a session, register with a name and an email, and take part on the slide. Organisers run their own rooms, with recordings of every session.</p>
          </div>
          <FooterGroup title="Discover" links={[["Upcoming events", "/explore"], ["Communities", "/explore?view=rooms"], ["How it works", "#how"], ["In the session", "#together"]]} />
          <FooterGroup title="Attending" links={[["Join with email and code", "/join"], ["Happening soon", "#events"]]} />
          <FooterGroup title="Organise" links={[["Start a community", "/login"], ["For organisers", "#organise"], ["Pricing", "#pricing"], ["Host sign in", "/login"]]} />
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-ink-muted sm:px-6">
            <span>© {new Date().getFullYear()} Tertulia · tertulia.cloud</span>
            <span>Runs entirely in the browser.</span>
          </div>
        </div>
      </footer>
    </>
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

function SectionHeading({ title, body, href, link }: { title: string; body: string; href: string; link: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
        <p className="mt-3 text-lg text-ink-muted">{body}</p>
      </div>
      <Link href={href} className="text-sm font-medium text-brand hover:underline">
        {link} →
      </Link>
    </div>
  );
}

function HowCard({ n, title, body, href, link }: { n: string; title: string; body: string; href: string; link: string }) {
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface-sunken p-6">
      <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-contrast">{n}</span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      <Link href={href} className="mt-4 text-sm font-medium text-brand hover:underline">
        {link} →
      </Link>
    </li>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-6">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

/**
 * What a plan includes, in the order an organiser weighs it: how often, how many, how long,
 * then what the paid plans add. Read from PLAN_LIMITS so the page and the gates never disagree.
 * A line the plan lacks stays visible but recedes (faint, no tick) instead of a red cross: the
 * contrast with the next card does the persuading, not alarm.
 */
function planLines(l: PlanLimits): { text: string; included: boolean }[] {
  const sessions = l.sessionsPerMonth === null ? "Unlimited sessions" : l.sessionsPerMonth === 1 ? "1 session a month" : `${l.sessionsPerMonth} sessions a month`;
  const length = l.minutes >= 60 ? `${l.minutes / 60} hours per session` : `${l.minutes} minutes per session, hard stop`;
  return [
    { text: sessions, included: true },
    { text: `${l.participants} attendees per session`, included: true },
    { text: length, included: true },
    { text: "Polls, quizzes, word clouds, chat and Q&A", included: true },
    { text: "Welcome email and reminders for every event", included: true },
    { text: l.recording ? "Every session recorded" : "Sessions recorded", included: l.recording },
    { text: l.promoteSlots > 0 ? `${l.promoteSlots} ${l.promoteSlots === 1 ? "guest" : "guests"} on stage at a time` : "Guests on stage", included: l.promoteSlots > 0 },
    { text: "Fallback stream when the room is full", included: l.hlsFallback },
    { text: "Sell with a Stripe checkout on the slide", included: l.stripeCta },
  ];
}

function PlanCard({ plan, featured, blurb, price, per, note, cta, href, variant }: { plan: Plan; featured?: boolean; blurb: string; price: string; per: string; note: string; cta: string; href: string; variant: "primary" | "secondary" }) {
  const l = PLAN_LIMITS[plan];
  return (
    <li
      className={cx(
        "relative flex flex-col rounded-2xl p-8",
        featured ? "border-2 border-brand bg-surface-raised shadow-float lg:-my-4 lg:py-12" : "border border-line bg-surface-raised shadow-card",
      )}
    >
      {featured && (
        <Badge tone="brand" className="absolute -top-3 left-8">
          For the weekly organiser
        </Badge>
      )}
      <h3 className="text-base font-semibold text-ink">{l.label}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{blurb}</p>
      <p className="mt-6 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight text-ink">{price}</span>
        <span className="text-sm text-ink-muted">{per}</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">{note}</p>
      <ButtonLink href={href} variant={variant} size="lg" className="mt-6 w-full">
        {cta}
      </ButtonLink>
      <ul className="mt-8 space-y-3 text-sm">
        {planLines(l).map((line) => (
          <li key={line.text} className={cx("flex items-start gap-3", line.included ? "text-ink" : "text-ink-faint")}>
            <span aria-hidden className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold", line.included ? "bg-brand-soft text-brand-ink" : "bg-surface-inset")}>
              {line.included ? "✓" : "–"}
            </span>
            <span>
              {line.text}
              {!line.included && <span className="sr-only"> (not included)</span>}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("#") ? (
              <a href={href} className="text-ink hover:text-brand">
                {label}
              </a>
            ) : (
              <Link href={href} className="text-ink hover:text-brand">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The room as members see it, drawn with the real layout: a slide, the organiser in the
 * corner, and a poll overlay mid-vote. An illustration, not a screenshot, so it stays true
 * as the product changes and ships with no image to load.
 */
function RoomMock({ className }: { className?: string }) {
  const options: [string, number, boolean][] = [
    ["Once a week", 41, false],
    ["Twice a month", 23, true],
    ["Once a month", 36, false],
  ];
  return (
    <div className={className} aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-overlay">
        <div className="flex h-11 items-center justify-between border-b border-line px-4">
          <div className="flex items-center gap-2">
            <Logo wordmark={false} className="scale-90" />
            <span className="text-sm font-semibold text-ink">Lisbon Product Circle · October meetup</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge>128 here</Badge>
            <Badge tone="live" dot>
              Live
            </Badge>
          </div>
        </div>
        <div className="relative aspect-[4/3] bg-slate-950 sm:aspect-[16/7]">
          {/* the slide */}
          <div className="absolute inset-4 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 p-5 sm:inset-6 sm:p-8">
            <div className="h-3 w-40 rounded bg-white/70 sm:h-4 sm:w-64" />
            <div className="mt-3 h-2 w-72 max-w-[70%] rounded bg-white/25" />
            <div className="mt-2 h-2 w-56 max-w-[55%] rounded bg-white/25" />
            <div className="mt-2 h-2 w-64 max-w-[60%] rounded bg-white/25" />
          </div>
          {/* organiser */}
          <div className="absolute bottom-5 right-5 flex h-14 w-24 items-end rounded-md bg-gradient-to-t from-indigo-500/60 to-slate-700 p-1.5 ring-1 ring-white/30 sm:h-20 sm:w-32">
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">Maria · organiser</span>
          </div>
          {/* the poll overlay */}
          <div className="absolute left-1/2 top-1/2 w-[min(88%,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-overlay backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold leading-snug">How often should we meet?</p>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">12s</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {options.map(([label, pct, on]) => (
                <li key={label} className={on ? "rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast" : "rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium"}>
                  <span className="flex justify-between">
                    <span>{label}</span>
                    <span className="opacity-70">{pct}%</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 h-8 rounded-md bg-white text-center text-xs font-semibold leading-8 text-slate-900">Vote</div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex gap-1.5 text-base">
            {["👍", "❤️", "😂", "😮", "👏"].map((e) => (
              <span key={e} className="flex size-8 items-center justify-center rounded-full border border-line bg-surface-raised shadow-card">
                {e}
              </span>
            ))}
          </div>
          <span className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink">✋ Raise hand</span>
        </div>
      </div>
    </div>
  );
}

/** A community's public page header and room controls in its own colour, with the real brand variables overridden the way the room does it. */
function BrandMock() {
  const vars = {
    "--brand": "#0f766e",
    "--brand-hover": "color-mix(in srgb, #0f766e 85%, black)",
    "--brand-soft": "color-mix(in srgb, #0f766e 14%, transparent)",
    "--brand-ink": "color-mix(in srgb, #0f766e 70%, var(--ink))",
    "--brand-contrast": "#ffffff",
  } as CSSProperties;
  return (
    <div aria-hidden style={vars} className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-float">
      <div className="flex h-14 items-center justify-between gap-4 border-b border-line px-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 items-center rounded-md bg-brand px-2 text-xs font-bold tracking-wide text-brand-contrast">NORTHWIND</span>
          <span className="hidden text-sm font-semibold text-ink sm:inline">Northwind Makers</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast">Register for the next event</span>
          <Badge tone="brand" dot className="hidden sm:inline-flex">
            84 people
          </Badge>
        </div>
      </div>
      <div className="space-y-4 bg-surface-sunken p-5">
        <div className="flex flex-wrap gap-1.5">
          {["woodworking", "3d printing", "lisbon"].map((t) => (
            <span key={t} className="rounded-full border border-line bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-ink-muted">
              {t}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast">Lock in</span>
          <span className="rounded-lg border border-line-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink">Raise hand</span>
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast">A chosen answer</span>
        </div>
        {[
          ["Yes, this quarter", 62],
          ["Next year", 28],
          ["Not planned", 10],
        ].map(([label, pct]) => (
          <div key={label}>
            <div className="flex justify-between text-xs text-ink">
              <span>{label}</span>
              <span className="text-ink-muted">{pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-inset">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
        <p className="text-xs text-ink-muted">Preview of a community in its own teal. Members see its public page, the invite page and the room in the same colour.</p>
      </div>
    </div>
  );
}
