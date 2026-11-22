"use client";
import { useState, type FormEvent } from "react";
import { TopicPicker } from "@/components/TopicPicker";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Stat, cx } from "@/components/ui";
import { api } from "@/lib/api";
import type { RoomAccess } from "@/lib/billing";
import { NEXT_PLAN, PLAN_LIMITS, PRICE_LABELS, planLines, type Plan, type PriceLookup } from "@/lib/plans";
import type { PlanStatus, StripeMode } from "@/lib/supabase/types";

export type BillingRoom = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  plan_status: PlanStatus;
  access: RoomAccess;
  /** The price chosen at checkout, kept so an abandoned purchase can be completed. */
  price_lookup: string | null;
  has_subscription: boolean;
  stripe_mode: StripeMode | null;
  used: number;
  cap: number | null;
  period_end: string;
};

export type BillingSummary = {
  org: { id: string; name: string; stripe_mode: StripeMode | null; has_customer: boolean };
  rooms: BillingRoom[];
  owner: boolean;
  platform_admin: boolean;
};

const PLAN_ROWS: { plan: Plan; monthly: PriceLookup; yearly: PriceLookup }[] = [
  { plan: "starter", monthly: "starter_monthly", yearly: "starter_yearly" },
  { plan: "pro", monthly: "pro_monthly", yearly: "pro_yearly" },
];

/** The anchor a PlanGate links to, so a host lands on the room they were just told about. */
export function billingAnchor(roomId: string) {
  return `room-${roomId}`;
}

/**
 * One organisation's billing: each room with its plan and usage and the step up, then the
 * way to add a room. Stripe holds the subscriptions: a room's first plan is bought through
 * Checkout, a change of plan or a cancellation goes through the Customer Portal (the same
 * button opens it when the room already subscribes), and the webhook is what writes the plan
 * back, so this panel never claims a plan Stripe has not confirmed. The plan belongs to the
 * room: the first room is free until upgraded, every further room is its own Starter or Pro
 * subscription, and a free room never sits next to a paid one.
 */
export function BillingPanel({ summary, mode }: { summary: BillingSummary; mode: StripeMode }) {
  const { org, rooms } = summary;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [newPrice, setNewPrice] = useState<PriceLookup>("starter_monthly");

  const go = async (key: string, body: Record<string, unknown>, path = "/api/billing/checkout") => {
    setBusy(key);
    setError(null);
    try {
      const r = await api<{ url: string }>(path, body);
      window.location.assign(r.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };
  const buy = (roomId: string, price: PriceLookup) => go(`${roomId}:${price}`, { room_id: roomId, price });
  const portal = () => go("portal", { org_id: org.id }, "/api/billing/portal");
  const addRoom = (e: FormEvent) => {
    e.preventDefault();
    return go("new-room", { org_id: org.id, price: newPrice, new_room: { name: newName, topics: newTopics } });
  };

  const anyPaid = rooms.some((r) => r.access.paid || r.access.complimentary);
  const otherMode = org.stripe_mode && org.stripe_mode !== mode;

  return (
    <Card>
      <CardHeader
        title={org.name}
        description={rooms.length === 1 ? "One room. The plan belongs to the room: free until you upgrade it." : `${rooms.length} rooms, each with its own plan.`}
        actions={
          summary.owner && org.has_customer ? (
            <Button variant="secondary" size="sm" onClick={() => void portal()} loading={busy === "portal"}>
              Manage billing
            </Button>
          ) : undefined
        }
      />
      {otherMode && (
        <Alert tone="neutral" className="mt-4">
          This organisation&apos;s billing lives in Stripe {org.stripe_mode} mode while new payments go to {mode} mode. <em>Manage billing</em> still opens the right account.
        </Alert>
      )}
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      <ul className="mt-6 divide-y divide-line">
        {rooms.map((room) => (
          <RoomRow key={room.id} room={room} owner={summary.owner} busy={busy} onBuy={buy} />
        ))}
      </ul>

      <div id="rooms" className="mt-6 scroll-mt-20 rounded-lg bg-surface-inset p-4">
        {summary.platform_admin ? (
          <p className="text-sm text-ink-muted">As a platform admin you create rooms from your rooms page at no charge; they run at Pro.</p>
        ) : !summary.owner ? (
          <p className="text-sm text-ink-muted">Only the organisation&apos;s owner can change plans or add rooms.</p>
        ) : !anyPaid ? (
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">Need another room?</span> Upgrade your room first; a free room cannot sit next to another. After that, every room you add is its own Starter or Pro subscription.
          </p>
        ) : adding ? (
          <form onSubmit={(e) => void addRoom(e)} className="space-y-4">
            <h3 className="font-sans text-sm font-semibold text-ink">Add a room</h3>
            <Field label="Room name" htmlFor="new-room-name" hint="Shown to attendees; the /r/ address comes from it.">
              <Input id="new-room-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} required autoFocus className="max-w-md" />
            </Field>
            <Field label="What is it about?" hint="People browsing Explore filter by topic.">
              <TopicPicker value={newTopics} onChange={setNewTopics} compact />
            </Field>
            <Field label="Plan" htmlFor="new-room-price" hint="Charged at checkout; the room opens when the payment is through.">
              <Select id="new-room-price" value={newPrice} onChange={(e) => setNewPrice(e.target.value as PriceLookup)} className="max-w-xs">
                {PLAN_ROWS.flatMap((row) => [row.monthly, row.yearly]).map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LIMITS[p.startsWith("pro") ? "pro" : "starter"].label} · {PRICE_LABELS[p].amount}/{PRICE_LABELS[p].period}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={busy === "new-room"} disabled={!newName.trim() || !!busy}>
                Continue to payment
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={!!busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Add a room</p>
              <p className="text-xs text-ink-muted">Another standing room with its own events, people and emails, on Starter or Pro.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={!!busy}>
              Add a room
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * One room: what it is on and how much of it is used, then the plans it could be on. The one
 * step up is the only row with a fill and the only primary button, so the choice is a nudge
 * and not a menu; every row lists what that plan gives, from the same lines the host page
 * prints, so what a gate promised is what the host finds here.
 */
function RoomRow({ room, owner, busy, onBuy }: { room: BillingRoom; owner: boolean; busy: string | null; onBuy: (roomId: string, price: PriceLookup) => void }) {
  const { access } = room;
  const limits = access.limits;
  const resets = new Date(room.period_end).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const pending = room.plan_status === "unpaid";
  const pendingPrice = (room.price_lookup && room.price_lookup in PRICE_LABELS ? room.price_lookup : "starter_monthly") as PriceLookup;
  const currentPlan: Plan = access.paid ? room.plan : "free";
  const nextPlan = NEXT_PLAN[currentPlan];
  const length = limits.minutes >= 60 ? `${limits.minutes / 60} h` : `${limits.minutes} min`;

  return (
    <li id={billingAnchor(room.id)} className="scroll-mt-20 py-6 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-base font-semibold text-ink">{room.name}</h3>
            <Badge tone={access.complimentary || access.paid ? "brand" : "neutral"}>{access.complimentary ? "Complimentary" : limits.label}</Badge>
            {room.plan_status === "past_due" && <Badge tone="warning">Payment overdue</Badge>}
            {pending && <Badge tone="warning">Payment pending</Badge>}
            {access.locked && !pending && <Badge tone="warning">Locked</Badge>}
            {room.stripe_mode === "test" && room.has_subscription && <Badge tone="warning">Sandbox subscription</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            /r/{room.slug} · {limits.participants} attendees · {length} per session · {limits.reminders ? "reminder emails" : "welcome email only"}
          </p>
        </div>
        <Stat value={room.cap === null ? `${room.used}` : `${room.used} / ${room.cap}`} label={room.cap === null ? "sessions this month" : `sessions · resets ${resets}`} className="shrink-0" />
      </div>

      {access.locked && (
        <Alert tone="warning" className="mt-4">
          {access.reason}
        </Alert>
      )}
      {room.plan_status === "past_due" && (
        <Alert tone="warning" className="mt-4">
          The last payment failed. Stripe retries for about two weeks; update the card under <em>Manage billing</em> to keep the plan.
        </Alert>
      )}

      {owner && !access.complimentary && (
        <div className="mt-4">
          {pending ? (
            <Button size="sm" onClick={() => onBuy(room.id, pendingPrice)} loading={busy === `${room.id}:${pendingPrice}`} disabled={!!busy}>
              Complete payment · {PRICE_LABELS[pendingPrice].amount}/{PRICE_LABELS[pendingPrice].period}
            </Button>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {PLAN_ROWS.map((row) => {
                const current = row.plan === currentPlan;
                const next = row.plan === nextPlan;
                const l = PLAN_LIMITS[row.plan];
                return (
                  <div key={row.plan} className={cx("flex flex-wrap items-center justify-between gap-4 px-4 py-3", next && "bg-brand-soft/40")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{l.label}</span>
                        {current && <Badge tone="success">Current</Badge>}
                        {next && <Badge tone="brand">Next step up</Badge>}
                      </p>
                      <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">{planLines(l).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" variant={current ? "ghost" : next ? "primary" : "secondary"} onClick={() => onBuy(room.id, row.monthly)} loading={busy === `${room.id}:${row.monthly}`} disabled={!!busy || current}>
                        {current ? "Current plan" : `${PRICE_LABELS[row.monthly].amount}/${PRICE_LABELS[row.monthly].period}`}
                      </Button>
                      {!current && (
                        <Button size="sm" variant="ghost" onClick={() => onBuy(room.id, row.yearly)} loading={busy === `${room.id}:${row.yearly}`} disabled={!!busy}>
                          {PRICE_LABELS[row.yearly].amount}/{PRICE_LABELS[row.yearly].period} · 2 months free
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {room.has_subscription && !pending && <p className="mt-2 text-xs text-ink-muted">Changing plan opens Stripe&apos;s billing portal, where the difference is prorated; cancelling and your invoices are there too, under <em>Manage billing</em>.</p>}
        </div>
      )}
    </li>
  );
}
