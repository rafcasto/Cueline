"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, TextLink } from "@/components/ui";
import { api } from "@/lib/api";
import { recordingLength, retention } from "@/lib/recordings";

export type AdminRecording = {
  id: string;
  room_name: string;
  room_slug: string;
  org_name: string;
  started_at: string | null;
  ended_at: string | null;
  recording_url: string;
  recording_expires_at: string | null;
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Every recording still on file, newest first, with a delete that removes the files now. A
 * deleted row leaves the table at once; the server re-render that follows confirms it.
 */
export function AdminRecordings({ recordings }: { recordings: AdminRecording[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const rows = recordings.filter((r) => !removed.has(r.id));

  const remove = async (r: AdminRecording) => {
    const what = `${r.room_name}${r.started_at ? ` on ${when(r.started_at)}` : ""}`;
    if (!confirm(`Delete the recording of ${what}?\n\nThe MP4 and stream files are removed from storage now and the host loses the download. This cannot be undone.`)) return;
    setBusy(r.id);
    setError(null);
    try {
      await api("/api/admin/recordings", { session_id: r.id });
      setRemoved((prev) => new Set(prev).add(r.id));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Recordings" description={`${rows.length} on file across every room, newest first. Deleting one removes the files now and takes it off the host's Recordings tab.`} />
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {rows.length === 0 ? (
        <EmptyState className="mt-4" title="No recordings on file" description="Sessions on Pro rooms are recorded; they appear here once they end." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="py-2 pr-4">Room</th>
                <th className="py-2 pr-4">Recorded</th>
                <th className="py-2 pr-4">Length</th>
                <th className="py-2 pr-4">Retention</th>
                <th className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const len = recordingLength(r);
                const keep = retention(r.recording_expires_at);
                return (
                  <tr key={r.id} className={busy === r.id ? "opacity-50" : undefined}>
                    <td className="max-w-xs py-3 pr-4">
                      <div className="truncate font-medium">{r.room_slug ? <TextLink href={`/host/${r.room_slug}`}>{r.room_name}</TextLink> : <span className="text-ink">{r.room_name}</span>}</div>
                      <div className="truncate text-xs text-ink-muted">{r.org_name}</div>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-muted">{r.started_at ? when(r.started_at) : "—"}</td>
                    <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-ink-muted">{len ?? "—"}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-muted">
                      {keep.kind === "expired" ? (
                        <Badge tone="neutral">Expiring</Badge>
                      ) : keep.kind === "soon" ? (
                        <Badge tone="warning">{keep.days === 1 ? "1 day left" : `${keep.days} days left`}</Badge>
                      ) : (
                        keep.label
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ButtonLink href={r.recording_url} external variant="ghost" size="sm" download>
                          Download
                        </ButtonLink>
                        <Button variant="ghost" size="sm" className="hover:bg-error-soft hover:text-error" onClick={() => void remove(r)} loading={busy === r.id} disabled={!!busy}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
