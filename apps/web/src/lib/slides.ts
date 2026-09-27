/**
 * Google Slides API sync. Walks slides[].objectId and each slide's speaker notes,
 * parses cues, and returns rows for deck_slides. No Apps Script involved.
 * Requires an access token with https://www.googleapis.com/auth/presentations.readonly.
 */
import { parseNotes } from "@cueline/cues";
import { HttpError } from "@/lib/auth";

type TextElement = { textRun?: { content?: string } };
type PageElement = { objectId?: string; shape?: { text?: { textElements?: TextElement[] } } };
type Slide = {
  objectId: string;
  slideProperties?: {
    notesPage?: {
      pageElements?: PageElement[];
      notesProperties?: { speakerNotesObjectId?: string };
    };
  };
};
type Presentation = { presentationId: string; title?: string; slides?: Slide[] };

const FIELDS =
  "presentationId,title,slides(objectId,slideProperties.notesPage(notesProperties.speakerNotesObjectId,pageElements(objectId,shape.text.textElements.textRun.content)))";

export function speakerNotes(slide: Slide): string {
  const notes = slide.slideProperties?.notesPage;
  const id = notes?.notesProperties?.speakerNotesObjectId;
  const el = notes?.pageElements?.find((p) => p.objectId === id);
  return (el?.shape?.text?.textElements ?? []).map((t) => t.textRun?.content ?? "").join("");
}

export async function fetchPresentation(presentationId: string, accessToken: string): Promise<Presentation> {
  const url = `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}?fields=${encodeURIComponent(FIELDS)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 || res.status === 403) throw new HttpError(401, "Google token rejected; sign in again with Slides access");
  if (res.status === 404) throw new HttpError(404, "presentation not found or not shared with this account");
  if (!res.ok) throw new HttpError(502, `Slides API ${res.status}`);
  return (await res.json()) as Presentation;
}

export function slidesToRows(p: Presentation, orgId: string) {
  const rows = (p.slides ?? []).map((s, index) => {
    const notes = speakerNotes(s);
    const parsed = parseNotes(notes);
    return {
      org_id: orgId,
      presentation_id: p.presentationId,
      slide_object_id: s.objectId,
      index,
      notes: notes || null,
      poll_payload: parsed.poll,
      cta_payload: parsed.cta,
      synced_at: new Date().toISOString(),
      _errors: parsed.errors,
    };
  });
  const errors = rows.flatMap((r) => r._errors.map((e) => ({ index: r.index, error: e })));
  return { rows: rows.map((r) => { const { _errors, ...rest } = r; void _errors; return rest; }), errors, title: p.title ?? "" };
}
