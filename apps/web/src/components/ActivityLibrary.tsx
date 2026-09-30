"use client";
import { useState } from "react";
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
    <div className="rounded-lg border p-4 dark:border-neutral-700">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Activities</h2>
        <div className="flex gap-1">
          {KINDS.map((k) => (
            <button key={k.kind} onClick={() => setEditing({ kind: k.kind, title: "", options: k.kind === "poll" || k.kind === "quiz" ? [opt(), opt()] : [], config: k.kind === "cta" ? { destination: "tab", target: "" } : {} })} className="rounded border px-2 py-0.5 text-xs">
              + {k.label}
            </button>
          ))}
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
          <input autoFocus value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder={editing.kind === "cta" ? "Button label" : "Question"} className="w-full rounded border px-2 py-1 dark:bg-neutral-800" />
          {(editing.kind === "poll" || editing.kind === "quiz") && (
            <ul className="space-y-1">
              {(editing.options ?? []).map((o, i) => (
                <li key={o.id} className="flex items-center gap-2">
                  {editing.kind === "quiz" && (
                    <input type="checkbox" title="Correct answer" checked={!!o.correct} onChange={(e) => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, correct: e.target.checked } : x)) })} />
                  )}
                  <input value={o.label} onChange={(e) => setEditing({ ...editing, options: editing.options!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={`Option ${i + 1}`} className="flex-1 rounded border px-2 py-1 dark:bg-neutral-800" />
                  <button onClick={() => setEditing({ ...editing, options: editing.options!.filter((_, j) => j !== i) })} className="text-neutral-400">✕</button>
                </li>
              ))}
              {(editing.options?.length ?? 0) < 10 && (
                <li><button onClick={() => setEditing({ ...editing, options: [...(editing.options ?? []), opt()] })} className="text-xs text-indigo-700">+ option</button></li>
              )}
            </ul>
          )}
          {editing.kind === "cta" && (
            <div className="flex gap-2">
              <select value={editing.config?.destination ?? "tab"} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, destination: e.target.value as CtaDestination } })} className="rounded border px-2 py-1 dark:bg-neutral-800">
                <option value="stripe">Stripe checkout</option>
                <option value="embed">Embedded page</option>
                <option value="tab">New tab</option>
              </select>
              <input value={editing.config?.target ?? ""} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, target: e.target.value } })} placeholder={editing.config?.destination === "stripe" ? "price_…" : "https://…"} className="flex-1 rounded border px-2 py-1 dark:bg-neutral-800" />
            </div>
          )}
          {editing.kind !== "cta" && (
            <div className="flex flex-wrap items-center gap-3">
              <label>
                Timer{" "}
                <select value={editing.timer_seconds ?? ""} onChange={(e) => setEditing({ ...editing, timer_seconds: e.target.value ? Number(e.target.value) : null })} className="rounded border px-2 py-1 dark:bg-neutral-800">
                  <option value="">none</option>
                  {[10, 15, 20, 30, 45, 60, 90, 120, 180, 300].map((s) => <option key={s} value={s}>{s}s</option>)}
                </select>
              </label>
              {editing.kind === "quiz" && (
                <label>Points <input type="number" min={100} step={100} value={editing.points ?? 1000} onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) })} className="w-20 rounded border px-2 py-1 dark:bg-neutral-800" /></label>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-50">Save</button>
            <button onClick={() => setEditing(null)} className="rounded border px-3 py-1">Cancel</button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {activities.length === 0 && !editing && <li className="text-neutral-500">No activities yet. Add a poll, quiz, word cloud or call to action.</li>}
        {activities.map((a) => (
          <li key={a.id} className={`flex items-center gap-2 rounded px-2 py-1 ${activeId === a.id ? "bg-indigo-50 dark:bg-indigo-950" : ""}`}>
            <span className="w-20 shrink-0 text-xs uppercase text-neutral-500">{a.kind}</span>
            <span className="flex-1 truncate">{a.title}</span>
            {a.timer_seconds && <span className="text-xs text-neutral-500">⏱ {a.timer_seconds}s</span>}
            {onActivate && (
              <button onClick={() => void onActivate(a)} disabled={activeId === a.id} className="rounded bg-green-600 px-2 py-0.5 text-xs text-white disabled:opacity-40">
                {activeId === a.id ? "Active" : "Activate"}
              </button>
            )}
            <button onClick={() => setEditing(a)} className="text-xs text-neutral-500">edit</button>
            <button onClick={() => void remove(a)} className="text-xs text-red-600">delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function opt(): ActivityOption {
  return { id: Math.random().toString(36).slice(2, 8), label: "" };
}
