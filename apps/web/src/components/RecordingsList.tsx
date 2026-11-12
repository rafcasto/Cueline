"use client";
import Link from "next/link";
import { Alert, Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import type { PlanLimits } from "@/lib/plans";
import type { Session } from "@/lib/supabase/types";

type Props = {
  /** Ended sessions with a recording, newest first. */
  recordings: Session[];
  limits: PlanLimits;
  /** A session is live and being recorded right now. */
  live: boolean;
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function length(s: Session) {
  if (!s.started_at || !s.ended_at) return null;
  const mins = Math.max(1, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

/**
 * The room's recordings: one MP4 per session that went live on a plan with recording, as the
 * attendees saw it (deck, presenter video, activities). Each is kept for the plan's retention
 * and removed by the nightly sweep; the row stays, marked, so the host knows where it went.
 */
export function RecordingsList({ recordings, limits, live }: Props) {
  const retention = limits.recordingDays ? (limits.recordingDays >= 365 ? "a year" : `${limits.recordingDays} days`) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!limits.recording && (
        <Alert tone="brand" title="Recording is on the paid plans">
          Sessions on this room are not recorded. Upgrade on{" "}
          <Link href="/host/billing" className="font-medium underline underline-offset-4">
            Billing
          </Link>{" "}
          and every session from then on is saved as an MP4 of what attendees saw.
        </Alert>
      )}
      {live && (
        <Alert tone="success" title="Recording now">
          This session is being recorded. The file is ready a few moments after you end the session.
        </Alert>
      )}
      <Card>
        <CardHeader
          title="Recordings"
          description={retention ? `What attendees saw, as an MP4. Each one is kept for ${retention} after the session, then deleted.` : "What attendees saw, as an MP4."}
        />
        {recordings.length === 0 ? (
          <EmptyState className="mt-4" title="No recordings yet" description={limits.recording ? "Go live and the session is recorded; it appears here when you end it." : undefined} />
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recordings.map((s) => {
              const gone = !!s.recording_deleted_at;
              const expired = !gone && !!s.recording_expires_at && new Date(s.recording_expires_at) < new Date();
              const len = length(s);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{s.started_at ? when(s.started_at) : when(s.created_at)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {len && <span>{len}</span>}
                      {len && " · "}
                      {gone
                        ? `Deleted ${day(s.recording_deleted_at!)}`
                        : expired
                          ? "Past its retention; deleted on the next sweep"
                          : s.recording_expires_at
                            ? `Kept until ${day(s.recording_expires_at)}`
                            : "Kept"}
                    </p>
                  </div>
                  {gone || expired ? (
                    <Badge tone="neutral">{gone ? "Deleted" : "Expiring"}</Badge>
                  ) : (
                    <ButtonLink href={s.recording_url!} external variant="secondary" size="sm" download>
                      Download MP4
                    </ButtonLink>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
