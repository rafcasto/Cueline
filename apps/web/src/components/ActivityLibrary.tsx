"use client";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, cx } from "@/components/ui";
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

/** Presenter-authored activities: create, edit, delete, and activate at any point. */
export function ActivityLibrary({ roomId, orgId, activities, onChange, onActivate, activeId }: Props) {
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = supabaseBrowser();

  const save = async () => {
    if (!editing?.title?.trim()) return;
    setBusy(true);
    const row = {
      org_id: orgId,
      room_id: roomId,
      kind: editing.kind ?? "poll",
      title: editing.title.trim(),
      options: editing.kind === "wordcloud" || editing.kind === "cta" ? [] : (editing.options ?? []).filter((o) => o.label.trim()),
      config: editing.config ?? {},
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
            onClick={() => setEditing({ kind: k.kind, title: "", options: k.kind === "poll" || k.kind === "quiz" ? [opt(), opt()] : [], config: k.kind === "cta" ? { destination: "tab", target: "" } : {} })}
          >
            + {k.label}
          </Button>
        ))}
      />

      {editing && (
        <div className="mt-6 space-y-4 rounded-lg bg-surface-inset p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{editing.id ? "Edit" : "New"} {kindLabel(editing.kind ?? "poll").toLowerCase()}</p>
          <Field label={editing.kind === "cta" ? "Button label" : "Question"} htmlFor="activity-title">
            <Input id="activity-title" autoFocus value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </Field>
          {(editing.kind === "poll" || editing.kind === "quiz") && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Options{editing.kind === "quiz" && <span className="ml-2 text-xs font-normal text-ink-muted">tick the correct answer</span>}</p>
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
                    <Input value={o.label} onChange={(e) => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={`Option ${i + 1}`} />
                    <Button variant="ghost" size="sm" aria-label="Remove option" onClick={() => setEditing({ ...editing, options: editing.options!.filter((_, j) => j !== i) })}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
              {(editing.options?.length ?? 0) < 10 && (
                <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, options: [...(editing.options ?? []), opt()] })}>
                  + Add option
                </Button>
              )}
            </div>
          )}
          {editing.kind === "cta" && (
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <Field label="Opens" htmlFor="cta-destination">
                <Select id="cta-destination" value={editing.config?.destination ?? "tab"} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, destination: e.target.value as CtaDestination } })}>
                  <option value="stripe">Stripe checkout</option>
                  <option value="embed">Embedded page</option>
                  <option value="tab">New tab</option>
                </Select>
              </Field>
              <Field label={editing.config?.destination === "stripe" ? "Price id" : "URL"} htmlFor="cta-target">
                <Input id="cta-target" value={editing.config?.target ?? ""} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, target: e.target.value } })} placeholder={editing.config?.destination === "stripe" ? "price_…" : "https://…"} />
              </Field>
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
                {a.timer_seconds && <span className="hidden text-xs tabular-nums text-ink-muted sm:inline">⏱ {a.timer_seconds}s</span>}
                {onActivate && (
                  <Button variant="success" size="sm" onClick={() => void onActivate(a)} disabled={active}>
                    {active ? "Active" : "Activate"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => void remove(a)}>
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
