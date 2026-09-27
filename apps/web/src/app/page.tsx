import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Cueline</h1>
      <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-300">
        Webinars where the slides drive the engagement. Type a cue into a Google Slides speaker note; when that slide comes up, the poll or call-to-action pops for every viewer.
      </p>
      <pre className="mt-6 rounded bg-neutral-100 p-4 text-sm dark:bg-neutral-800">{`#poll: Which channel brings you the most leads? | Email | LinkedIn | Referrals | Paid
#cta: Join the waitlist | embed | https://cueline.app/waitlist
#cta: Buy the course | stripe | price_1Abc...`}</pre>
      <div className="mt-6 flex gap-3">
        <Link href="/host" className="rounded bg-indigo-600 px-4 py-2 text-white">Host panel</Link>
        <Link href="/r/main" className="rounded border px-4 py-2">Join the main room</Link>
      </div>
    </main>
  );
}
