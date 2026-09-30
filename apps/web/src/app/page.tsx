import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Cueline</h1>
      <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-300">
        Webinars with the engagement built in. Upload your deck as a PDF, present it in the room, and launch polls, quizzes and word clouds as overlays for everyone watching. Set a timer, then reveal the results when it runs out.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/host" className="rounded bg-indigo-600 px-4 py-2 text-white">Host panel</Link>
        <Link href="/r/main" className="rounded border px-4 py-2">Join the main room</Link>
      </div>
    </main>
  );
}
