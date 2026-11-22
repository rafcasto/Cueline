import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/components/AppShell";
import { ButtonLink, cx } from "@/components/ui";
import hostPanel from "@/images/host-panel.webp";
import pollOverlay from "@/images/poll-overlay.webp";
import { PLAN_LIMITS, PRICE_LABELS, type Plan, type PlanLimits } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Host an event",
  description: "Open your own room on Tertulia, run your live session in the browser, and see who in your audience is engaged and ready for more.",
};

/**
 * The host page does the selling (docs/BRAND.md, Website): the hook, the three pains, how it
 * works in three steps, what is in the box, proof, the plans and the questions people ask
 * before they open a room. The demo video and the testimonials render only once there is a
 * real one to show: fill in DEMO_VIDEO_URL and TESTIMONIALS below and the sections appear.
 *
 * Every claim is something the product does today. The plans read from PLAN_LIMITS so the
 * page never drifts from the gates, and list only the limits the app enforces and the features
 * a host can reach from the product; what every plan shares is said once above the columns.
 * The founding-host card is an invitation, not a price: the deal itself is agreed by email.
 */

/** A hosted MP4 or an embeddable player URL; empty hides the demo section. */
const DEMO_VIDEO_URL = "";

/** Real hosts only. Empty hides the proof section. */
const TESTIMONIALS: { quote: string; name: string; role: string; photo?: string }[] = [];

export default function ForHostsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-ink-muted">For hosts</p>
            <h1 className="mt-3 text-balance text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl">Know who&apos;s ready to buy before your event ends</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted sm:text-xl">Tertulia turns live reactions into audience insights, so you know exactly who to follow up with.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/login" size="lg" className="w-full sm:w-auto" data-track="hosts_hero_start">
                Start hosting free
              </ButtonLink>
              <ButtonLink href={DEMO_VIDEO_URL ? "#demo" : "#how"} variant="secondary" size="lg" className="w-full sm:w-auto" data-track="hosts_hero_demo">
                {DEMO_VIDEO_URL ? "Watch the demo" : "See how it works"}
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-muted">Free to start, no card. Attendees never pay and never need an account.</p>
          </div>
          <figure className="mx-auto w-full max-w-xl lg:max-w-none">
            <Image src={hostPanel} alt="The host panel's Event tab: every registration with its seat, join code, registration time and whether the person is in the room, beside each person's poll answers and call-to-action taps" priority sizes="(min-width: 1024px) 560px, 100vw" className="rounded-xl shadow-float" />
            <figcaption className="mt-3 text-center text-sm text-ink-muted">Who registered, who turned up, and what each of them did.</figcaption>
          </figure>
        </section>

        {/* Problem */}
        <Section id="problem" title="Running a live event, you fly blind">
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            <Pain title="You can't see who's really engaged">A list of names tells you who registered. It says nothing about who leaned in, answered, asked, or sat silent.</Pain>
            <Pain title="Follow-ups are guesswork">So you email everyone the same message, the people who were ready get the same note as the people who left early.</Pain>
            <Pain title="Your audience disappears after the event">The call ends, the tab closes, and the room you gathered has nowhere to come back to.</Pain>
          </ul>
        </Section>

        {/* How it works */}
        <Section id="how" title="How it works" body="Three steps, all in the browser. No download for you or for your audience.">
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            <Step n={1} title="Open your room" body="Name it, say what it is about, pick your colour and logo. List it on Explore so people find it, or keep it to the people you invite." />
            <Step n={2} title="Run your live session" body="Upload your slides, go live on camera, and launch polls, quizzes, word clouds and calls to action over the slide everyone is watching." />
            <Step n={3} title="See who's ready for more" body="Who registered against who turned up, who answered what, who tapped your call to action. Follow up with the right people." />
          </ol>
        </Section>

        {/* Features */}
        <Section id="features" title="What's in the room">
          <figure className="mx-auto mt-8 max-w-3xl">
            <Image src={pollOverlay} alt="A poll open over the slide: the question, four answers with their percentages, a timer running down, and the host on camera in the corner" sizes="(min-width: 768px) 768px, 100vw" className="rounded-xl shadow-float" />
            <figcaption className="mt-3 text-center text-sm text-ink-muted">A poll over the slide everyone is watching, with the timer running and the host still on camera.</figcaption>
          </figure>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<ReactionsIcon />} title="Live reactions">Six reactions float across every screen while you talk, so you feel the room and the room feels each other.</Feature>
            <Feature icon={<PollIcon />} title="Polls, quizzes and Q&A">Launch an activity over the slide, set a timer, reveal the result when you say so. Questions queue up with upvotes.</Feature>
            <Feature icon={<InsightsIcon />} title="Engagement insights">Who registered, who showed up, who answered each activity and how, all in the room after the event.</Feature>
            <Feature icon={<SignalIcon />} title="Buyer signals">A call to action on the slide, with every view and tap recorded against the person who made it, and Stripe checkout on Pro.</Feature>
            <Feature icon={<RoomIcon />} title="Public or private rooms">List your room on Explore for anyone to find, or keep it unlisted and share the invite link yourself.</Feature>
            <Feature icon={<BrowserIcon />} title="Runs in any browser">Presenters on camera, attendees watching live, a hand raised and brought on stage in about a second. Nothing to install.</Feature>
          </ul>
        </Section>

        {/* Demo video */}
        {DEMO_VIDEO_URL && (
          <Section id="demo" title="See it in two minutes">
            <div className="mt-8 overflow-hidden rounded-xl bg-espresso shadow-float">
              <video className="aspect-video w-full" src={DEMO_VIDEO_URL} controls preload="metadata" />
            </div>
          </Section>
        )}

        {/* Proof */}
        {TESTIMONIALS.length > 0 && (
          <Section id="proof" title="Hosts on Tertulia">
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {TESTIMONIALS.map((t) => (
                <li key={t.name} className="flex flex-col rounded-xl bg-surface-raised p-6 shadow-card">
                  <p className="flex-1 text-lg leading-relaxed text-ink">“{t.quote}”</p>
                  <div className="mt-6 flex items-center gap-3">
                    {t.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.photo} alt="" className="size-12 rounded-full object-cover" />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft font-heading text-xl text-accent-ink">{t.name[0]}</span>
                    )}
                    <div>
                      <p className="font-semibold text-ink">{t.name}</p>
                      <p className="text-sm text-ink-muted">{t.role}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Pricing */}
        <Section id="pricing" title="Pay for the room you run, not for the people in it" body="Attendees never pay. Every plan has polls, quizzes, word clouds, chat and Q&A on the slide, raised hands and a stage, seats and a waiting list per event, your colour and logo, and a welcome email on registration. The plans differ in how often, how many and how long.">
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            <PlanCard plan="free" blurb="A trial of the whole engagement layer: one real session with a timer and a reveal." price="$0" per="forever" note="No card. Go live today." cta="Start free" href="/login" variant="secondary" />
            <PlanCard
              plan="starter"
              featured
              blurb="The weekly host: a full room, two-hour sessions and reminders that ask the no-shows to free their seat."
              price={PRICE_LABELS.starter_monthly.amount}
              per="a month"
              note={`Or ${PRICE_LABELS.starter_yearly.amount} a year, two months free.`}
              cta="Start with Starter"
              href="/login?next=/host/billing"
              variant="primary"
            />
            <PlanCard
              plan="pro"
              blurb="Several sessions a week, a bigger room, longer sessions, and Stripe checkout on your call to action."
              price={PRICE_LABELS.pro_monthly.amount}
              per="a month"
              note={`Or ${PRICE_LABELS.pro_yearly.amount} a year, two months free.`}
              cta="Go Pro"
              href="/login?next=/host/billing"
              variant="secondary"
            />
          </ul>

          {/* Founding host */}
          <div className="mt-6 flex flex-col gap-6 rounded-xl border-2 border-accent bg-surface-raised p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent-ink">Founding host</p>
              <h3 className="mt-2 text-2xl text-ink">Be one of the first 50 rooms</h3>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-muted">Founding hosts shape what the audience insights show, get a direct line to the two of us building it, and are named on this page when they want to be. Open your room, then tell us you want in.</p>
            </div>
            <ButtonLink href="/login?next=/host" size="lg" className="shrink-0" data-track="hosts_founding">
              Become a founding host
            </ButtonLink>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-relaxed text-ink-muted">
            A plan is per room: your first room is free until you upgrade it, and every further room is its own Starter or Pro subscription. Prices in USD, billed through Stripe. Move up or down whenever you like; the difference is prorated, and cancelling takes effect at the end of the period you have paid for. A session counts the moment you press <em>Go live</em>; a false start nobody joined is given back. Pro is unlimited in count within a fair-use line of {PLAN_LIMITS.pro.poolParticipantHours} participant-hours a month. Tertulia runs on a single video server today, so there is no uptime guarantee on any plan yet.
          </p>
        </Section>

        {/* FAQ */}
        <Section id="faq" title="Questions hosts ask">
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            <Faq q="Do attendees need an account?">No. They register for an event with a name and an email. A welcome email brings a personal link and a six-character code; either one gets them into the room from any device.</Faq>
            <Faq q="Does it work with Zoom?">Tertulia is its own room: you present and go on camera in the browser, and your audience watches there too. There is nothing to install and no meeting link to juggle. A Zoom integration is on the roadmap.</Faq>
            <Faq q="What data do I see?">On Pro, who registered against who actually turned up, every answer to every poll, quiz and word cloud, the questions asked and upvoted, and every view and tap of your calls to action, each tied to the person who made it.</Faq>
            <Faq q="Can I keep my room private?">Yes. A room is unlisted until you tick List on Explore in its settings. Unlisted rooms are reached only through the invite links you share.</Faq>
            <Faq q="Can I use my own colours and logo?">Yes. Every room has an accent colour, a logo and a standing call to action; they apply to the room, the invite pages and every button in them.</Faq>
            <Faq q="Is there a recording?">Pro records every session, filmed as the audience saw it, and keeps it for {PLAN_LIMITS.pro.recordingDays} days. Download it from the room. Free and Starter sessions are not recorded.</Faq>
          </dl>
        </Section>

        {/* Final call to action */}
        <section className="bg-espresso text-cream">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:py-20">
            <div>
              <h2 className="text-3xl tracking-tight text-cream sm:text-4xl">Open your room today</h2>
              <p className="mt-3 max-w-xl text-lg text-cream/75">Your first room is free. Your first session can be this week.</p>
            </div>
            <ButtonLink href="/login?next=/host" size="lg" className="w-full shrink-0 sm:w-auto" data-track="hosts_final_founding">
              Become a founding host
            </ButtonLink>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function Section({ id, title, body, children }: { id: string; title: string; body?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-3xl">
          <h2 className="text-3xl tracking-tight text-ink sm:text-4xl">{title}</h2>
          {body && <p className="mt-3 text-lg leading-relaxed text-ink-muted">{body}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Pain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl bg-surface-raised p-6 shadow-card">
      <h3 className="text-2xl leading-tight text-ink">{title}</h3>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">{children}</p>
    </li>
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

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl bg-surface-raised p-6 shadow-card">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">{icon}</span>
      <h3 className="mt-4 font-sans text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-base leading-relaxed text-ink-muted">{children}</p>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-raised p-6 shadow-card">
      <dt className="font-sans text-base font-semibold text-ink">{q}</dt>
      <dd className="mt-2 text-base leading-relaxed text-ink-muted">{children}</dd>
    </div>
  );
}

/**
 * What sets a plan apart, in the order a host weighs it: how often, how many, how long, then
 * the reminders. Read from PLAN_LIMITS so the page and the gates never disagree, and limited
 * to what the app enforces today. What every plan shares is said once above the columns.
 */
function planLines(l: PlanLimits): string[] {
  const sessions = l.sessionsPerMonth === null ? "Unlimited sessions" : l.sessionsPerMonth === 1 ? "1 session a month" : `${l.sessionsPerMonth} sessions a month`;
  const length = l.minutes >= 60 ? `${l.minutes / 60} hours per session` : `${l.minutes} minutes per session`;
  const lines = [sessions, `${l.participants} attendees per session`, length];
  if (l.reminders) lines.push("Reminder emails before every event");
  if (l.recording) lines.push(`Recordings kept ${l.recordingDays} days`);
  if (l.insights) lines.push("Audience insights: who showed up, engagement and fit scores");
  if (l.stripeCta) lines.push("Stripe checkout on your call to action");
  return lines;
}

function PlanCard({ plan, featured, blurb, price, per, note, cta, href, variant }: { plan: Plan; featured?: boolean; blurb: string; price: string; per: string; note: string; cta: string; href: string; variant: "primary" | "secondary" }) {
  const l = PLAN_LIMITS[plan];
  return (
    <li className={cx("flex flex-col rounded-xl bg-surface-raised p-6 shadow-card", featured && "ring-2 ring-brand")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-sans text-lg font-semibold text-ink">{l.label}</h3>
        {featured && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-brand-contrast">For the weekly host</span>}
      </div>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-heading text-5xl tracking-tight text-ink">{price}</span>
        <span className="text-sm text-ink-muted">{per}</span>
      </p>
      <p className="mt-1 text-sm text-ink-muted">{note}</p>
      <p className="mt-5 text-base leading-relaxed text-ink-muted">{blurb}</p>
      <ButtonLink href={href} variant={variant} size="lg" className="mt-8 w-full" data-track={`pricing_${plan}`}>
        {cta}
      </ButtonLink>
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

function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cx("mt-0.5 size-4 shrink-0 text-success", className)}>
      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const iconProps = { viewBox: "0 0 24 24", className: "size-5", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function ReactionsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  );
}
function PollIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
  );
}
function InsightsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6.5 3.5" />
    </svg>
  );
}
function SignalIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 16l5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </svg>
  );
}
function RoomIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20V8l8-5 8 5v12" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}
function BrowserIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9h18M7 7h.01M10 7h.01" />
    </svg>
  );
}
