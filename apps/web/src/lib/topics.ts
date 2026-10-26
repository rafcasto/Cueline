/**
 * Topics: what a room is about, the way Meetup groups carry categories. A room picks up to six
 * from the suggested list or types its own; visitors filter Explore by them. Pure, so the chip
 * picker in the browser and the API validate the same way.
 */
export const TOPIC_PATTERN = /^[a-z0-9][a-z0-9 -]{0,28}[a-z0-9]$/;
export const MAX_TOPICS = 6;

/** The categories offered when a room is created; a host can always type another. */
export const TOPIC_SUGGESTIONS: readonly string[] = [
  "technology",
  "software",
  "ai",
  "data",
  "design",
  "product management",
  "startups",
  "business",
  "marketing",
  "sales",
  "career",
  "leadership",
  "finance",
  "investing",
  "education",
  "science",
  "health",
  "fitness",
  "wellbeing",
  "parenting",
  "languages",
  "writing",
  "arts",
  "music",
  "photography",
  "film",
  "games",
  "food",
  "travel",
  "community",
  "faith",
  "sports",
  "outdoors",
  "pets",
];

export function normalizeTopic(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** "design, Product  Management, design" -> ["design", "product management"]; the error names the bad one. */
export function parseTopics(raw: unknown): { topics: string[] } | { error: string } {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const topics: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") return { error: "Topics must be text." };
    const t = normalizeTopic(item);
    if (!t) continue;
    if (!TOPIC_PATTERN.test(t)) return { error: `"${t}" is not a valid topic: 2 to 30 letters, digits, spaces or hyphens.` };
    if (!topics.includes(t)) topics.push(t);
  }
  if (topics.length > MAX_TOPICS) return { error: `Up to ${MAX_TOPICS} topics.` };
  return { topics };
}
