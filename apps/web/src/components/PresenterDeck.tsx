"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PdfPage } from "@/components/PdfPage";
import { StageCanvas } from "@/components/StageCanvas";
import { StageLayoutPicker } from "@/components/StageLayoutPicker";
import { Button, Card, CardHeader, Eyebrow, Select, buttonClass } from "@/components/ui";
import { countPages } from "@/lib/pdf";
import { describeLayout } from "@/lib/stage-layout";
import { publicUrl, uploadToBucket } from "@/lib/storage";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Presentation, Room, StageLayout } from "@/lib/supabase/types";

type Props = {
  room: Room;
  presentations: Presentation[];
  onPresentationsChange: (list: Presentation[]) => void;
  selected: Presentation | null;
  onSelect: (p: Presentation | null) => void;
  /** The presenter's current page (controlled by the host panel). */
  page: number;
  /** Live: the page participants currently see, for the "participants on N" hint. */
  participantsPage: number | null;
  onNavigate: (pageIndex: number) => Promise<void>;
  /** Where the camera sits on the stage, and what to do when the host moves it. */
  layout: StageLayout;
  onLayoutChange: (layout: StageLayout) => void;
  /** The host's own camera (or a placeholder for it), placed on the stage by the layout. */
  video: ReactNode;
  /** When the change reaches attendees: now, or when the session starts. */
  layoutHint: string;
};

/**
 * The host's stage: the deck page with the camera placed exactly as attendees see it.
 * Upload a PDF and step through it (every navigation is a slide_events row), and choose
 * where the video goes, by preset or by dragging it on the stage itself.
 */
export function PresenterDeck({ room, presentations, onPresentationsChange, selected, onSelect, page, participantsPage, onNavigate, layout, onLayoutChange, video, layoutHint }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const [pages, { path }] = await Promise.all([countPages(file), uploadToBucket("presentations", room.org_id, file)]);
      const { data, error } = await supabaseBrowser()
        .from("presentations")
        .insert({ org_id: room.org_id, room_id: room.id, name: file.name.replace(/\.pdf$/i, ""), storage_path: path, page_count: pages })
        .select("*")
        .single();
      if (error) throw error;
      const p = data as Presentation;
      onPresentationsChange([p, ...presentations]);
      onSelect(p);
      setMsg(`Uploaded ${p.name} (${pages} pages)`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const go = async (i: number) => {
    if (!selected) return;
    await onNavigate(Math.max(0, Math.min(selected.page_count - 1, i)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      // The camera box on the stage takes the arrows for itself while it has focus.
      if (t?.getAttribute("role") === "group") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") void go(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") void go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const url = selected ? publicUrl("presentations", selected.storage_path) : null;

  return (
    <Card>
      <CardHeader
        title="Stage"
        description="What attendees see: the deck page with your camera where you put it."
        actions={
          <>
            <Select value={selected?.id ?? ""} onChange={(e) => onSelect(presentations.find((p) => p.id === e.target.value) ?? null)} className="h-8 w-auto max-w-56 text-sm" aria-label="Deck">
              <option value="">No deck</option>
              {presentations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.page_count}p
                </option>
              ))}
            </Select>
            <label className={buttonClass("secondary", "sm", busy ? "pointer-events-none opacity-50" : undefined)}>
              {busy ? "Uploading…" : "Upload PDF"}
              <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
          </>
        }
      />
      {msg && <p className="mt-3 text-sm text-ink-muted">{msg}</p>}

      <StageCanvas layout={layout} editable onChange={onLayoutChange} slide={<PdfPage url={url} pageIndex={page} className="aspect-video" />} video={video} className="mt-6 rounded-lg border border-line" />

      <div className="mt-4 flex min-h-8 items-center justify-between gap-4">
        {selected ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => void go(page - 1)} disabled={page === 0}>
              ← Previous
            </Button>
            <span className="text-sm tabular-nums text-ink-muted">
              Page <span className="font-medium text-ink">{page + 1}</span> of {selected.page_count}
              {participantsPage !== null && participantsPage !== page && <span className="ml-2 text-amber-600 dark:text-amber-400">(participants on {participantsPage + 1})</span>}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void go(page + 1)} disabled={page >= selected.page_count - 1}>
              Next →
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink-muted">{layout.mode === "talking_head" ? "No deck is needed for a talking head." : "Upload a PDF to present it page by page; arrow keys step through it."}</p>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Eyebrow>Video placement</Eyebrow>
          <p className="text-xs text-ink-faint">{layoutHint}</p>
        </div>
        <StageLayoutPicker value={layout} onChange={onLayoutChange} className="mt-3" />
        <p className="mt-3 text-sm text-ink-muted" role="status">
          {describeLayout(layout)}
          {layout.mode === "custom" ? " Drag it on the stage; the handle resizes it. Arrow keys nudge, plus and minus resize." : " Drag the camera on the stage to place it yourself."}
        </p>
      </div>
    </Card>
  );
}
