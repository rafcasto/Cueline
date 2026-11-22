"use client";
import Link from "next/link";
import { Alert, Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import type { PlanLimits } from "@/lib/plans";
import { recordingLength, retention } from "@/lib/recordings";
import type { Session } from "@/lib/supabase/types";

type Props = {
  /** Ended sessions whose recording is still on file, newest first. */
  recordings: Session[];
  limits: PlanLimits;
  /** A session is live and being recorded right now. */
  live: boolean;
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The room's recordings: one MP4 per session that went live on a plan with recording, as the
 * attendees saw it (deck, presenter video, activities). Each is kept for the plan's retention
 * and removed by the nightly sweep or an admin; once it is gone the row goes with it.
 */
export function RecordingsList({ recordings, limits, live }: Props) {
  const keptFor = limits.recordingDays ? (limits.recordingDays >= 365 ? "a year" : `${limits.recordingDays} days`) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!limits.recording && (
        <Alert tone="brand" title="Recording is a Pro feature">
          Sessions on this room are not recorded. Move this room to Pro on{" "}
          <Link href="/host/billing" className="font-medium underline underline-offset-4">
            Billing
          </Link>{" "}
          and every session from then on is saved as an MP4 of what attendees saw, kept for a year.
        </Alert>
      )}
      <Card>
        <CardHeader title="Recordings" description={keptFor ? `What attendees saw, as an MP4, kept for ${keptFor} after each session.` : "What attendees saw, as an MP4."} />
        {live && (
          <div className="mt-6 flex items-center gap-4 rounded-lg bg-surface-inset px-4 py-3">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-live" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Recording now</p>
              <p className="mt-0.5 text-xs text-ink-muted">The file is ready a few moments after you end the session.</p>
            </div>
          </div>
        )}
        {recordings.length === 0 ? (
          <EmptyState className="mt-6" icon={<FilmIcon className="size-5" />} title="No recordings yet" description={limits.recording ? "Go live and the session is recorded; it appears here when you end it." : undefined} />
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recordings.map((s) => {
              const len = recordingLength(s);
              const keep = retention(s.recording_expires_at);
              return (
                <li key={s.id} className="flex items-center gap-4 py-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-inset text-ink-muted">
                    <FilmIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{when(s.started_at ?? s.created_at)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                      {len && <span className="tabular-nums">{len}</span>}
                      {len && <span aria-hidden>·</span>}
                      <span>{keep.label}</span>
                      {keep.kind === "soon" && <Badge tone="warning">{keep.days === 1 ? "1 day left" : `${keep.days} days left`}</Badge>}
                      {keep.kind === "expired" && <Badge tone="neutral">Expiring</Badge>}
                    </p>
                  </div>
                  <ButtonLink href={s.recording_url!} external variant="secondary" size="sm" download>
                    <DownloadIcon className="size-4" />
                    <span>
                      Download<span className="hidden sm:inline"> MP4</span>
                    </span>
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M3 15h18M8 5v14M16 5v14" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v11M7 10l5 5 5-5M4 19h16" />
    </svg>
  );
}
