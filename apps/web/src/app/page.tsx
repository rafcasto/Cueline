import Link from "next/link";
import { ButtonLink, Logo } from "@/components/ui";

/**
 * Landing page. Two doors and nothing else above the fold: hosts sign in, attendees join a
 * room with the email and code from their confirmation email (or the link in it).
 */
export default function Home() {
  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Link href="/login" className="text-sm font-medium text-ink-muted hover:text-ink">
          Host sign in
        </Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">Live webinars</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">Slides that ask the room a question.</h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
              Present a PDF deck live and launch polls, quizzes, word clouds and calls to action over it. Attendees answer from any device. No downloads, no accounts.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <DoorCard
              href="/login"
              eyebrow="I'm presenting"
              title="Log in as host"
              description="Open your room, share the invite link, run the deck and the activities."
              cta="Sign in"
              primary
            />
            <DoorCard
              href="/join"
              eyebrow="I'm attending"
              title="Join a room"
              description="Enter the email you registered with and the code from your confirmation email."
              cta="Join with email and code"
            />
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted">
            Got an invite link from the organiser? Open it and register; your personal join link arrives by email.
          </p>
        </section>

        <section className="border-t border-line bg-surface-raised">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-3">
            <Step n="1" title="Register once" body="The organiser's invite link asks for a name and an email. That's the whole form." />
            <Step n="2" title="Get your link" body="A confirmation lands in your inbox with a personal link and a code, then reminders before the start." />
            <Step n="3" title="Answer live" body="Polls and quizzes appear over the slides as the presenter launches them. Tap, vote, ask, react." />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-8 text-sm text-ink-muted sm:px-6">
        <span>© {new Date().getFullYear()} Tertulia · tertulia.cloud</span>
        <Link href="/login" className="hover:text-ink">
          Host sign in
        </Link>
      </footer>
    </>
  );
}

function DoorCard({ href, eyebrow, title, description, cta, primary }: { href: string; eyebrow: string; title: string; description: string; cta: string; primary?: boolean }) {
  return (
    <div className={primary ? "flex flex-col rounded-2xl border border-indigo-200 bg-brand-soft p-6 shadow-card dark:border-indigo-900" : "flex flex-col rounded-2xl border border-line bg-surface-raised p-6 shadow-card"}>
      <p className={primary ? "text-xs font-semibold uppercase tracking-wider text-brand-ink" : "text-xs font-semibold uppercase tracking-wider text-ink-muted"}>{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      <ButtonLink href={href} variant={primary ? "primary" : "secondary"} size="lg" className="mt-6 w-full">
        {cta}
      </ButtonLink>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-ink">{n}</div>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
