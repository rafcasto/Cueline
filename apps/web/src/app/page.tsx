import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, ButtonLink, Logo } from "@/components/ui";

/**
 * Landing page. The same skeleton as the category leaders (promise, engagement, branding,
 * how it works, closing call to action) but every line describes something the product does
 * today: no ratings, logos or percentages until there are real ones to show.
 *
 * Attendees also land here from a bookmark, so the two doors (host sign in, join a room) stay
 * in the hero and in the footer.
 */
export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-surface-sunken/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Tertulia home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-muted md:flex" aria-label="Primary">
            <Link href="/explore" className="hover:text-ink">
              Explore
            </Link>
            <a href="#engage" className="hover:text-ink">
              Engagement
            </a>
            <a href="#branding" className="hover:text-ink">
              Branding
            </a>
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/join" className="hidden text-sm font-medium text-ink-muted hover:text-ink sm:inline">
              Join a room
            </Link>
            <ButtonLink href="/login" size="sm">
              Host sign in
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--brand-soft),transparent_70%)]" />
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">Live webinars, browser only</p>
              <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
                Webinars where the slides <em className="not-italic text-brand">ask the room</em>.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
                Present your deck live and launch polls, quizzes, word clouds and calls to action over it. Attendees answer on the slide they are watching, from any device, with no download and no account.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink href="/login" size="lg" className="w-full sm:w-auto">
                  Create your room
                </ButtonLink>
                <ButtonLink href="/join" variant="secondary" size="lg" className="w-full sm:w-auto">
                  I&apos;m attending, join a room
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-ink-muted">Got an invite link from the organiser? Open it and register; your personal join link arrives by email.</p>
            </div>

            <RoomMock className="mx-auto mt-14 max-w-4xl" />
          </div>
        </section>

        {/* Engagement */}
        <section id="engage" className="border-t border-line bg-surface-raised scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Engage the audience without leaving the slide</h2>
              <p className="mt-3 text-lg text-ink-muted">Every activity opens as an overlay on the deck, with a timer if you want one, and the results reveal when you say so.</p>
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Engagement features">
              {["Polls", "Quizzes with scores", "Word clouds", "Calls to action", "Live chat", "Q&A with upvotes", "Reactions", "Raise hand", "Bring on stage"].map((t) => (
                <li key={t}>
                  <Badge tone="brand" className="px-3 py-1 text-sm">
                    {t}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <Feature
                title="Polls and word clouds"
                body="Author them before the session, launch any of them at any slide. Attendees tap an answer or type a word; the tally or the cloud appears as the reveal."
              />
              <Feature
                title="Quizzes with a leaderboard"
                body="Mark the correct answers and set the points. Answers are scored server-side as they land, with a bonus for speed, and the leaderboard runs across the whole session."
              />
              <Feature
                title="Calls to action that convert in the room"
                body="Open a page in a new tab, embed it over the slide, or take a card payment with Stripe without the attendee leaving. Views, taps and conversions are logged per slide."
              />
              <Feature title="Chat and Q&A the host moderates" body="Attendees chat with the room and ask questions with upvotes. The host approves the questions everyone sees, hides a chat message with one tap, and marks questions answered." />
              <Feature title="Reactions and hands" body="Six reactions float across everyone's screen. A raised hand can be promoted to the stage, camera and all, in about a second." />
              <Feature title="A waiting room with sound" body="A picture or a looping video, music, and your welcome text on a 16:9 canvas while the doors are open. It stops the moment you go live." />
            </div>
          </div>
        </section>

        {/* Branding */}
        <section id="branding" className="border-t border-line scroll-mt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Your colour. Your logo. Your call to action.</h2>
              <p className="mt-3 text-lg text-ink-muted">
                Pick an accent and upload a logo once per room. The invite page, the waiting room chrome and every button, badge and chosen answer in the room take your colour. Add a standing call to action and it sits in the header for the whole session.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink">
                <Check>Accent colour with readable text, light or dark, chosen for you</Check>
                <Check>Logo in place of ours, in the room and on the invite page</Check>
                <Check>A standing call to action button, plus calls to action you launch mid-talk</Check>
                <Check>A welcome email and four reminders per room, edited once and inherited by every event</Check>
              </ul>
            </div>
            <BrandMock />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-line bg-surface-raised scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Webinars, the Tertulia way</h2>
              <p className="mt-3 text-lg text-ink-muted">Four steps, one browser tab, nothing to install for anyone.</p>
            </div>
            <ol className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <Step n="1" title="Create" items={["Make a room with your branding", "Upload the deck as a PDF", "Author polls, quizzes, word clouds and calls to action, each with an optional timer", "Design the waiting room"]} />
              <Step n="2" title="Invite" items={["Create an event with a start time; it is also the invite link", "Attendees register with a name and an email, nothing else", "A welcome email with a personal link and a join code", "Reminders at 48 h, 24 h, 2 h and 15 min"]} />
              <Step n="3" title="Host" items={["Open the waiting room, then go live", "Present the deck; everyone sees the page you are on", "Launch an activity on any slide and close it when the timer ends", "Promote a raised hand to the stage"]} />
              <Step n="4" title="Reveal" items={["Show results as an overlay: tallies, the cloud or the leaderboard", "Hide and bring back any activity at any time", "See who registered against who joined", "Every session is recorded"]} />
            </ol>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Run your next webinar on Tertulia</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-ink-muted">Sign in, create a room, share the link. Attendees need a browser and nothing else.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/login" size="lg" className="w-full sm:w-auto">
                Host sign in
              </ButtonLink>
              <ButtonLink href="/join" variant="secondary" size="lg" className="w-full sm:w-auto">
                Join with email and code
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface-raised">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">Live webinars with the engagement built into the slides. Presenters on WebRTC, attendees in any browser, recordings of every session.</p>
          </div>
          <FooterGroup title="Product" links={[["Engagement", "#engage"], ["Branding", "#branding"], ["How it works", "#how"], ["Host sign in", "/login"]]} />
          <FooterGroup title="Attending" links={[["Explore upcoming events", "/explore"], ["Join with email and code", "/join"], ["Host sign in", "/login"]]} />
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

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-sunken p-6">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
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

function Step({ n, title, items }: { n: string; title: string; items: string[] }) {
  return (
    <li>
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-contrast">{n}</span>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
      </div>
      <ul className="mt-4 space-y-2 border-l border-line pl-4 text-sm leading-relaxed text-ink-muted">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
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
 * The room as attendees see it, drawn with the real layout: a slide, the presenter in the
 * corner, and a poll overlay mid-vote. An illustration, not a screenshot, so it stays true
 * as the product changes and ships with no image to load.
 */
function RoomMock({ className }: { className?: string }) {
  const options: [string, number, boolean][] = [
    ["Price", 41, false],
    ["Onboarding time", 23, true],
    ["Integrations", 36, false],
  ];
  return (
    <div className={className} aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-overlay">
        <div className="flex h-11 items-center justify-between border-b border-line px-4">
          <div className="flex items-center gap-2">
            <Logo wordmark={false} className="scale-90" />
            <span className="text-sm font-semibold text-ink">Product launch Q4</span>
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
          {/* presenter */}
          <div className="absolute bottom-5 right-5 flex h-14 w-24 items-end rounded-md bg-gradient-to-t from-indigo-500/60 to-slate-700 p-1.5 ring-1 ring-white/30 sm:h-20 sm:w-32">
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">Maria · host</span>
          </div>
          {/* the poll overlay */}
          <div className="absolute left-1/2 top-1/2 w-[min(88%,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-overlay backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold leading-snug">What slowed your last rollout the most?</p>
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

/** A room header and controls in a customer's colour, with the real brand variables overridden the way the room does it. */
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
          <span className="hidden text-sm font-semibold text-ink sm:inline">Customer day 2026</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast">Book a demo ↗</span>
          <Badge tone="brand" dot className="hidden sm:inline-flex">
            84 here
          </Badge>
        </div>
      </div>
      <div className="space-y-4 bg-surface-sunken p-5">
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
        <p className="text-xs text-ink-muted">Preview of a room in a customer&apos;s teal. Attendees see the invite page and the room in the same colour.</p>
      </div>
    </div>
  );
}
