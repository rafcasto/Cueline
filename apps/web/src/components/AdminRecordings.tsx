"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";

export type AdminRecording = {
  id: string;
  room_name: string;
  room_slug: string;
  org_name: string;
  started_at: string | null;
  ended_at: string | null;
  recording_url: string;
  recording_expires_at: string | null;
  recording_deleted_at: string | null;
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function length(s: AdminRecording) {
  if (!s.started_at || !s.ended_at) return null;
  const mins = Math.max(1, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

/** Every recording on the platform, newest first, with a delete that removes the files now and marks the session. */
export function AdminRecordings({ recordings }: { recordings: AdminRecording[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (r: AdminRecording) => {
    if (!confirm(`Delete the recording of ${r.room_name}${r.started_at ? ` on ${when(r.started_at)}` : ""}? The host loses the download; this cannot be undone.`)) return;
    setBusy(r.id);
    setError(null);
    try {
      await api("/api/admin/recordings", { session_id: r.id });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const kept = recordings.filter((r) => !r.recording_deleted_at);
  return (
    <Card>
      <CardHeader title="Recordings" description={`${kept.length} kept across every room. Deleting one removes the files from the bucket now and marks the session; the host's Recordings tab shows it as deleted.`} />
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {recordings.length === 0 ? (
        <EmptyState className="mt-4" title="No recordings" description="Sessions on Pro rooms are recorded; they appear here once they end." />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {recordings.map((r) => {
            const gone = !!r.recording_deleted_at;
            const len = length(r);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.room_name} <span className="font-normal text-ink-muted">· {r.org_name}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {r.started_at ? when(r.started_at) : "—"}
                    {len && ` · ${len}`}
                    {" · "}
                    {gone ? `Deleted ${day(r.recording_deleted_at!)}` : r.recording_expires_at ? `Kept until ${day(r.recording_expires_at)}` : "Kept"}
                  </p>
                </div>
                {gone ? (
                  <Badge tone="neutral">Deleted</Badge>
                ) : (
                  <>
                    <ButtonLink href={r.recording_url} external variant="ghost" size="sm" download>
                      Download
                    </ButtonLink>
                    <Button variant="danger" size="sm" onClick={() => void remove(r)} loading={busy === r.id} disabled={!!busy}>
                      Delete
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
