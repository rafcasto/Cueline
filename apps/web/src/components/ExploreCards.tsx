import Link from "next/link";
import { BrandScope, RoomMark } from "@/components/RoomBrand";
import { Badge, ButtonLink, cx } from "@/components/ui";
import { eventStatus, formatEventTime, isEventFull, type PublicEvent, type PublicRoom } from "@/lib/explore";

/** Fewer than this many seats left turns the count amber (docs/BRAND.md, event card states). */
const FEW_SPOTS = 5;

/**
 * One upcoming event in the directory, in the order someone scanning decides: the topic, the
 * title, whose room, when (in the visitor's own time zone, which `formatEventTime` handles),
 * how many spots are left, and the one teal button in. States: open, few spots left (amber),
 * full ("Join waitlist", a quiet button), live (a coral "LIVE now" badge and a green button).
 */
export function EventCard({ event, className }: { event: PublicEvent; className?: string }) {
  const { day, time } = formatEventTime(event.starts_at, event.timezone);
  const status = eventStatus(event);
  const full = isEventFull(event);
  const left = event.capacity === null ? null : Math.max(0, event.capacity - event.going);
  const topic = event.room_topics[0];
  return (
    <li className={cx("flex flex-col rounded-xl bg-surface-raised p-5 shadow-card transition-shadow hover:shadow-float", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {topic && <Badge tone="brand">{topic}</Badge>}
        {status === "live" && (
          <Badge tone="live" dot>
            LIVE now
          </Badge>
        )}
        {status === "soon" && <Badge tone="warning">Starting soon</Badge>}
        {full && status !== "live" && <Badge>Full</Badge>}
      </div>
      <Link href={`/join/${event.token}`} className="mt-3 line-clamp-2 text-xl leading-snug text-ink hover:underline">
        {event.title}
      </Link>
      <div className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
        <BrandScope branding={event.room_branding} className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft">
          <RoomMark branding={event.room_branding} name={event.room_name} className="h-4 max-w-6" />
        </BrandScope>
        <span className="truncate">
          Hosted in{" "}
          <Link href={`/explore/${event.room_slug}`} className="font-semibold text-ink hover:underline">
            {event.room_name}
          </Link>
        </span>
      </div>
      <p className="mt-2 text-sm text-ink">
        <time dateTime={event.starts_at}>
          {day} · {time}
        </time>
      </p>
      {event.description && <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{event.description}</p>}
      <div className="mt-5 flex flex-1 flex-wrap items-end justify-between gap-3">
        <span className={cx("text-sm", left !== null && left < FEW_SPOTS && !full ? "font-semibold text-warning-ink" : "text-ink-muted")}>
          {full ? (event.waiting === 1 ? "1 on the waiting list" : `${event.waiting} on the waiting list`) : left === null ? (event.going === 1 ? "1 going" : `${event.going} going`) : left === 1 ? "1 spot left" : `${left} spots left`}
        </span>
        <ButtonLink href={`/join/${event.token}`} size="sm" variant={status === "live" ? "success" : full ? "secondary" : "primary"}>
          {status === "live" ? "Join now" : full ? "Join waitlist" : "Join"}
        </ButtonLink>
      </div>
    </li>
  );
}

/**
 * A listed room: a cover band in the room's accent with its mark, the name, one line about it,
 * how many people are in it, and the way in. Every room in the directory is public (a host
 * lists it from Settings); the label says so, and will carry "Private" when invite-only rooms
 * get a teaser page. A room with no logo shows the product mark in the band, so the grid stays even.
 */
export function RoomCard({ room }: { room: PublicRoom }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-xl bg-surface-raised shadow-card transition-shadow hover:shadow-float">
      <BrandScope branding={room.branding} className="flex h-24 items-center bg-brand-soft px-5">
        <RoomMark branding={room.branding} name={room.name} className="h-9 max-w-full" />
      </BrandScope>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/explore/${room.slug}`} className="truncate text-xl leading-snug text-ink hover:underline">
            {room.name}
          </Link>
          {room.session_state === "live" && (
            <Badge tone="live" dot>
              LIVE now
            </Badge>
          )}
        </div>
        {room.description && <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{room.description}</p>}
        <div className="mt-4 flex flex-1 flex-wrap items-end justify-between gap-3">
          <div className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{room.people === 1 ? "1 member" : `${room.people} members`}</span>
            {" · "}
            {room.upcoming_events === 1 ? "1 upcoming event" : `${room.upcoming_events} upcoming events`}
            {" · "}
            <RoomVisibility />
          </div>
          <ButtonLink href={`/explore/${room.slug}`} size="sm">
            Join room
          </ButtonLink>
        </div>
      </div>
    </li>
  );
}

/** Public (teal outline) or Private (grey with a lock). Only public rooms are listed today. */
export function RoomVisibility({ priv }: { priv?: boolean }) {
  return priv ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-2 py-0.5 text-xs font-semibold text-ink-muted">
      <svg viewBox="0 0 16 16" className="size-3" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      Private
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-brand px-2 py-px text-xs font-semibold text-brand">Public</span>
  );
}

/** Topic filter chips. `base` may already carry a query (`/explore?view=rooms`); the topic is appended either way. */
export function TopicChips({ topics, active, className, base = "/explore" }: { topics: string[]; active?: string; className?: string; base?: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <ul className={cx("flex flex-wrap gap-1.5", className)}>
      {topics.map((t) => (
        <li key={t}>
          <Link
            href={active === t ? base : `${base}${sep}topic=${encodeURIComponent(t)}`}
            className={cx(
              "inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
              active === t ? "border-brand bg-brand text-brand-contrast" : "border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {t}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Browse by topic: one tile per topic with an icon, the name and how many rooms carry it.
 * Four across on desktop, two on a phone; the tile lifts on hover.
 */
export function TopicTiles({ topics, className }: { topics: { topic: string; rooms: number }[]; className?: string }) {
  return (
    <ul className={cx("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {topics.map((t) => (
        <li key={t.topic}>
          <Link
            href={`/explore?view=rooms&topic=${encodeURIComponent(t.topic)}`}
            className="group flex h-full flex-col gap-4 rounded-xl bg-surface-raised p-5 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-float"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <TopicIcon topic={t.topic} className="size-5" />
            </span>
            <span>
              <span className="block text-base font-semibold capitalize text-ink">{t.topic}</span>
              <span className="block text-sm text-ink-muted">{t.rooms === 1 ? "1 room" : `${t.rooms} rooms`}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A simple rounded line icon per topic family; a speech bubble for anything else. */
function TopicIcon({ topic, className }: { topic: string; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (/career|job|leadership|sales|business|startup|product|marketing|finance|invest/.test(topic))
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12h18" />
      </svg>
    );
  if (/\bai\b|data|software|tech|science/.test(topic))
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M9 9h6v6H9zM12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    );
  if (/creativ|design|art|music|photo|film|writing|games/.test(topic))
    return (
      <svg {...common}>
        <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2v-1a2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 9 9 0 0 0-9-9z" />
        <circle cx="7.5" cy="12" r="1" />
        <circle cx="10" cy="7.5" r="1" />
        <circle cx="15" cy="7.5" r="1" />
      </svg>
    );
  if (/health|fitness|well|parent|food|travel|outdoor|sport|pet/.test(topic))
    return (
      <svg {...common}>
        <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4A3.5 3.5 0 0 1 4 12.5z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}
