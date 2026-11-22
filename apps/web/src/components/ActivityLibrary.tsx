"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Switch, cx } from "@/components/ui";
import { CTA_BUTTONS_MAX, CTA_BUTTON_LABEL_MAX, ctaButtons, emptyCtaButton, parseCtaButtons, type CtaButton } from "@/lib/cta";
import { FIT_MAX, hasFitScoring, optionFit, withFit } from "@/lib/insights";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Activity, ActivityKind, ActivityOption, CtaDestination } from "@/lib/supabase/types";

type Props = {
  roomId: string;
  orgId: string;
  activities: Activity[];
  onChange: (list: Activity[]) => void;
  /** Present while a session is open; activates the activity for participants. */
  onActivate?: (a: Activity) => Promise<void>;
  activeId?: string | null;
};

const KINDS: { kind: ActivityKind; label: string }[] = [
  { kind: "poll", label: "Poll" },
  { kind: "quiz", label: "Quiz" },
  { kind: "wordcloud", label: "Word cloud" },
  { kind: "cta", label: "Call to action" },
];

const kindLabel = (k: ActivityKind) => KINDS.find((x) => x.kind === k)?.label ?? k;

/**
 * Presenter-authored activities: create, edit, delete, and activate at any point. A call to action
 * is a title over the slides and a group of up to three buttons, each with its own destination;
 * the form always edits the buttons as a list (`config.buttons`), reading older rows through
 * ctaButtons() so their one button appears as the first of the list. Every poll and quiz answer
 * can carry a fit score (0–FIT_MAX, `options[].fit`): what picking it says about how well the
 * attendee fits the offer, read by the Insights tab. The column is behind a switch so an ordinary
 * poll's form stays as plain as it was; switching it off drops the scores on save.
 */
export function ActivityLibrary({ roomId, orgId, activities, onChange, onActivate, activeId }: Props) {
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [fitOn, setFitOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = (a: Partial<Activity>) => {
    setEditing(a);
    setFitOn(hasFitScoring(a.options ?? []));
  };
  const sb = supabaseBrowser();

  const buttons: CtaButton[] = editing?.kind === "cta" ? ctaButtons({ config: editing.config ?? {} }) : [];
  const setButtons = (next: CtaButton[]) => setEditing((e) => (e ? { ...e, config: { ...e.config, buttons: next } } : e));

  const save = async () => {
    if (!editing?.title?.trim()) return;
    let config = editing.config ?? {};
    if (editing.kind === "cta") {
      const parsed = parseCtaButtons(buttons);
      if ("error" in parsed) return alert(parsed.error);
      config = parsed.config;
    }
    setBusy(true);
    const row = {
      org_id: orgId,
      room_id: roomId,
      kind: editing.kind ?? "poll",
      title: editing.title.trim(),
      options: editing.kind === "wordcloud" || editing.kind === "cta" ? [] : withFit((editing.options ?? []).filter((o) => o.label.trim()).map((o) => (fitOn ? o : { ...o, fit: undefined }))),
      config,
      timer_seconds: editing.timer_seconds ?? null,
      points: editing.points ?? 1000,
      sort_order: editing.sort_order ?? activities.length,
    };
    const q = editing.id ? sb.from("activities").update(row).eq("id", editing.id) : sb.from("activities").insert(row);
    const { data, error } = await q.select("*").single();
    setBusy(false);
    if (error) return alert(error.message);
    const a = data as Activity;
    onChange(editing.id ? activities.map((x) => (x.id === a.id ? a : x)) : [...activities, a]);
    setEditing(null);
  };

  const remove = async (a: Activity) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    await sb.from("activities").delete().eq("id", a.id);
    onChange(activities.filter((x) => x.id !== a.id));
  };

  return (
    <Card>
      <CardHeader
        title="Activities"
        description="Polls, quizzes, word clouds and calls to action. Activate one while live and it appears over the slides."
        actions={KINDS.map((k) => (
          <Button
            key={k.kind}
            variant="secondary"
            size="sm"
            onClick={() => open({ kind: k.kind, title: "", options: k.kind === "poll" || k.kind === "quiz" ? [opt(), opt()] : [], config: k.kind === "cta" ? { destination: "tab", target: "", buttons: [emptyCtaButton()] } : {} })}
          >
            + {k.label}
          </Button>
        ))}
      />

      {editing && (
        <div className="mt-6 space-y-4 rounded-lg bg-surface-inset p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{editing.id ? "Edit" : "New"} {kindLabel(editing.kind ?? "poll").toLowerCase()}</p>
          <Field label={editing.kind === "cta" ? "Title" : "Question"} htmlFor="activity-title" hint={editing.kind === "cta" ? "The heading over the slides, above the buttons." : undefined}>
            <Input id="activity-title" autoFocus value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder={editing.kind === "cta" ? "Next steps" : undefined} />
          </Field>
          {(editing.kind === "poll" || editing.kind === "quiz") && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Options{editing.kind === "quiz" && <span className="ml-2 text-xs font-normal text-ink-muted">tick the correct answer</span>}</p>
              {fitOn && (
                <div className="flex items-center gap-2" aria-hidden>
                  {editing.kind === "quiz" && <span className="size-4 shrink-0" />}
                  <span className="flex-1" />
                  <span className="flex-none text-center text-xs font-semibold uppercase tracking-wider text-ink-muted" style={{ width: "3.5rem" }}>
                    Fit
                  </span>
                  <Button variant="ghost" size="sm" className="invisible" tabIndex={-1}>
                    ✕
                  </Button>
                </div>
              )}
              <ul className="space-y-2">
                {(editing.options ?? []).map((o, i) => (
                  <li key={o.id} className="flex items-center gap-2">
                    {editing.kind === "quiz" && (
                      <input
                        type="checkbox"
                        title="Correct answer"
                        className="size-4 shrink-0 accent-brand"
                        checked={!!o.correct}
                        onChange={(e) => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, correct: e.target.checked } : x)) })}
                      />
                    )}
                    <Input value={o.label} onChange={(e) => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={`Option ${i + 1}`} className="min-w-0 flex-1" />
                    {fitOn && (
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={FIT_MAX}
                        step={1}
                        aria-label={`Fit score for option ${i + 1}, 0 to ${FIT_MAX}`}
                        value={o.fit ?? 0}
                        className="w-auto flex-none basis-14 text-center tabular-nums"
                        style={{ width: "3.5rem" }}
                        onChange={(e) => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, fit: e.target.value === "" ? 0 : Number(e.target.value) } : x)) })}
                        onBlur={() => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, fit: optionFit(x) } : x)) })}
                      />
                    )}
                    <Button variant="ghost" size="sm" aria-label="Remove option" onClick={() => setEditing({ ...editing, options: editing.options!.filter((_, j) => j !== i) })}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
                {(editing.options?.length ?? 0) < 10 ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, options: [...(editing.options ?? []), opt()] })}>
                    + Add option
                  </Button>
                ) : (
                  <span />
                )}
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Switch checked={fitOn} onChange={setFitOn} label="Score answers for fit" />
                  Score answers for fit
                </label>
              </div>
              {fitOn && (
                <p className="text-xs leading-relaxed text-ink-muted">
                  0–{FIT_MAX} per answer: how well someone who picks it fits your offer. Best answer here: {Math.max(0, ...(editing.options ?? []).map(optionFit))} · a perfect-fit attendee scores 100% on this question. The Insights tab adds it up across the session.
                </p>
              )}
            </div>
          )}
          {editing.kind === "cta" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">
                Buttons<span className="ml-2 text-xs font-normal text-ink-muted">up to {CTA_BUTTONS_MAX}, as a group; the first is in your accent</span>
              </p>
              <ul className="space-y-3">
                {buttons.map((b, i) => {
                  const set = (patch: Partial<CtaButton>) => setButtons(buttons.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <li key={i} className="grid gap-3 rounded-lg border border-line bg-surface-raised p-3 sm:grid-cols-[1fr_170px_1fr_auto] sm:items-end">
                      <Field label={i === 0 ? "Button label" : `Button ${i + 1} label`} htmlFor={`cta-label-${i}`}>
                        <Input id={`cta-label-${i}`} value={b.label} maxLength={CTA_BUTTON_LABEL_MAX} onChange={(e) => set({ label: e.target.value })} placeholder={buttons.length > 1 ? "Register your interest" : b.destination === "stripe" ? "Buy now" : "Open"} />
                      </Field>
                      <Field label="Opens" htmlFor={`cta-destination-${i}`}>
                        <Select id={`cta-destination-${i}`} value={b.destination} onChange={(e) => set({ destination: e.target.value as CtaDestination })}>
                          <option value="stripe">Stripe checkout</option>
                          <option value="embed">Embedded page</option>
                          <option value="tab">New tab</option>
                        </Select>
                      </Field>
                      <Field label={b.destination === "stripe" ? "Price id" : "URL"} htmlFor={`cta-target-${i}`}>
                        <Input id={`cta-target-${i}`} value={b.target} onChange={(e) => set({ target: e.target.value })} placeholder={b.destination === "stripe" ? "price_…" : "https://…"} spellCheck={false} />
                      </Field>
                      <Button variant="ghost" size="sm" aria-label={`Remove button ${i + 1}`} disabled={buttons.length === 1} className="sm:mb-1" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
                        ✕
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {buttons.length < CTA_BUTTONS_MAX && (
                <Button variant="ghost" size="sm" onClick={() => setButtons([...buttons, emptyCtaButton()])}>
                  + Add a button
                </Button>
              )}
            </div>
          )}
          {editing.kind !== "cta" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timer" htmlFor="activity-timer" hint="Answers close when it runs out.">
                <Select id="activity-timer" value={editing.timer_seconds ?? ""} onChange={(e) => setEditing({ ...editing, timer_seconds: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No timer</option>
                  {[10, 15, 20, 30, 45, 60, 90, 120, 180, 300].map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </Select>
              </Field>
              {editing.kind === "quiz" && (
                <Field label="Points" htmlFor="activity-points" hint="For a correct answer; faster answers keep more.">
                  <Input id="activity-points" type="number" min={100} step={100} value={editing.points ?? 1000} onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })} />
                </Field>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => void save()} loading={busy}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {activities.length === 0 && !editing ? (
        <EmptyState className="mt-6" title="No activities yet" description="Add a poll, quiz, word cloud or call to action with the buttons above." />
      ) : (
        <ul className="mt-6 divide-y divide-line">
          {activities.map((a) => {
            const active = activeId === a.id;
            return (
              <li key={a.id} className={cx("-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5", active && "bg-brand-soft")}>
                <Badge tone={active ? "brand" : "neutral"} className="w-24 justify-center">
                  {kindLabel(a.kind)}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{a.title}</span>
                {a.kind === "cta" && ctaButtons(a).length > 1 && <span className="hidden text-xs tabular-nums text-ink-muted sm:inline">{ctaButtons(a).length} buttons</span>}
                {(a.kind === "poll" || a.kind === "quiz") && hasFitScoring(a.options) && (
                  <span className="hidden sm:inline-flex" title="The answers carry fit scores; see Insights">
                    <Badge>Fit</Badge>
                  </span>
                )}
                {a.timer_seconds && <span className="hidden text-xs tabular-nums text-ink-muted sm:inline">⏱ {a.timer_seconds}s</span>}
                {onActivate && (
                  <Button variant="success" size="sm" onClick={() => void onActivate(a)} disabled={active}>
                    {active ? "Active" : "Activate"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => open(a)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-error hover:text-error-ink" onClick={() => void remove(a)}>
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function opt(): ActivityOption {
  return { id: Math.random().toString(36).slice(2, 8), label: "" };
}
