"use client";
import { useState } from "react";
import { Button, Input, cx } from "@/components/ui";
import { MAX_TOPICS, TOPIC_PATTERN, TOPIC_SUGGESTIONS, normalizeTopic } from "@/lib/topics";

type Props = {
  value: string[];
  onChange: (topics: string[]) => void;
  /** Fewer suggestions in a tight form; the chosen ones always show. */
  compact?: boolean;
  disabled?: boolean;
};

/**
 * What the room is about, chosen the way a Meetup group picks its categories: tap the chips
 * that fit, up to six, or type one of your own. The same list filters Explore, so a room that
 * picks "design" is found by everyone browsing design.
 */
export function TopicPicker({ value, onChange, compact, disabled }: Props) {
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= MAX_TOPICS;
  const suggestions = (compact ? TOPIC_SUGGESTIONS.slice(0, 18) : TOPIC_SUGGESTIONS).filter((t) => !value.includes(t));

  const toggle = (t: string) => {
    setError(null);
    if (value.includes(t)) onChange(value.filter((x) => x !== t));
    else if (!full) onChange([...value, t]);
  };
  const addCustom = () => {
    const t = normalizeTopic(custom);
    if (!t) return;
    if (!TOPIC_PATTERN.test(t)) return setError("2 to 30 letters, digits, spaces or hyphens.");
    if (value.includes(t)) return setCustom("");
    if (full) return setError(`Up to ${MAX_TOPICS} topics.`);
    setError(null);
    onChange([...value, t]);
    setCustom("");
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen topics">
          {value.map((t) => (
            <li key={t}>
              <button type="button" onClick={() => toggle(t)} disabled={disabled} className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-contrast transition-colors hover:opacity-90 disabled:opacity-50" aria-label={`Remove ${t}`}>
                {t}
                <span aria-hidden>✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex flex-wrap gap-1.5" aria-label="Suggested topics">
        {suggestions.map((t) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => toggle(t)}
              disabled={disabled || full}
              aria-pressed={false}
              className={cx("inline-block rounded-full border border-line bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50")}
            >
              {t}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Another topic…"
          aria-label="Add a topic of your own"
          maxLength={30}
          disabled={disabled || full}
          className="max-w-xs"
        />
        <Button type="button" variant="secondary" onClick={addCustom} disabled={disabled || full || !custom.trim()}>
          Add
        </Button>
      </div>
      <p className={cx("text-xs", error ? "text-red-600 dark:text-red-400" : "text-ink-muted")}>{error ?? `${value.length} of ${MAX_TOPICS} chosen. Visitors filter Explore by topic.`}</p>
    </div>
  );
}
