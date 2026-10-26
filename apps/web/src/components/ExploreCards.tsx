import Link from "next/link";
import { RoomMark } from "@/components/RoomBrand";
import { Badge, ButtonLink, cx } from "@/components/ui";
import { eventStatus, formatEventTime, isEventFull, type PublicEvent, type PublicRoom } from "@/lib/explore";

/** One upcoming event in the directory: when, what, whose room, how many are going, and the way in. */
export function EventCard({ event }: { event: PublicEvent }) {
  const { day, time } = formatEventTime(event.starts_at, event.timezone);
  const status = eventStatus(event);
  const full = isEventFull(event);
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-surface-raised p-5 shadow-card transition-shadow hover:shadow-float">
      <div className="w-16 shrink-0 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">{day.split(" ")[0]}</p>
        <p className="text-2xl font-semibold leading-tight text-ink">{day.split(" ")[1]}</p>
        <p className="text-xs text-ink-muted">{day.split(" ")[2]}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/join/${event.token}`} className="truncate text-base font-semibold text-ink hover:underline">
            {event.title}
          </Link>
          {status === "live" && (
            <Badge tone="live" dot>
              Live now
            </Badge>
          )}
          {status === "soon" && <Badge tone="warning">Starting soon</Badge>}
          {full && status !== "live" && <Badge>Full · waiting list</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {time} ·{" "}
          <Link href={`/explore/${event.room_slug}`} className="font-medium text-ink hover:underline">
            {event.room_name}
          </Link>
        </p>
        {event.description && <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{event.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ButtonLink href={`/join/${event.token}`} size="sm" variant={status === "live" ? "success" : full ? "secondary" : "primary"}>
            {status === "live" ? "Join now" : full ? "Join the waiting list" : "Register"}
          </ButtonLink>
          <span className="text-xs text-ink-muted">
            {event.going === 1 ? "1 person going" : `${event.going} people going`}
            {event.capacity !== null ? ` of ${event.capacity}` : ""}
            {event.waiting > 0 ? ` · ${event.waiting} waiting` : ""}
          </span>
        </div>
      </div>
    </li>
  );
}

/** A listed room: its mark, what it is about, and how active it is. */
export function RoomCard({ room }: { room: PublicRoom }) {
  return (
    <li className="rounded-xl border border-line bg-surface-raised p-5 shadow-card transition-shadow hover:shadow-float">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-inset">
          <RoomMark branding={room.branding} name={room.name} className="max-h-10 max-w-10" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/explore/${room.slug}`} className="truncate text-base font-semibold text-ink hover:underline">
              {room.name}
            </Link>
            {room.session_state === "live" && (
              <Badge tone="live" dot>
                Live now
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {room.upcoming_events === 1 ? "1 upcoming event" : `${room.upcoming_events} upcoming events`} · {room.people === 1 ? "1 person" : `${room.people} people`}
          </p>
        </div>
      </div>
      {room.description && <p className="mt-3 line-clamp-3 text-sm text-ink-muted">{room.description}</p>}
      {room.topics.length > 0 && <TopicChips topics={room.topics} className="mt-3" />}
    </li>
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
              "inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              active === t ? "border-brand bg-brand text-brand-contrast" : "border-line bg-surface-inset text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {t}
          </Link>
        </li>
      ))}
    </ul>
  );
}
