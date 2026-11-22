import type { ReactNode } from "react";
import { ButtonLink, Eyebrow, cx } from "@/components/ui";
import { PLAN_LIMITS, PRICE_LABELS, type Plan } from "@/lib/plans";

type Props = {
  /** What is locked, as the host would say it: "Audience insights", "Recordings", "Reminder emails", "Another session this month". */
  title: string;
  /** The plan that includes it; `planThatIncludes()` and `nextPlan()` in lib/plans pick it. */
  unlock: Exclude<Plan, "free">;
  /** The plan in force on this room, named in the eyebrow so the host sees where they stand. */
  current: string;
  /** One or two sentences on what opens up. No "upgrade here": the button is the action. */
  children: ReactNode;
  /** `block` is a card of its own (a whole tab, a refused action); `inline` is one row inside another card. */
  variant?: "block" | "inline";
  /** The room the gate is about: the billing page opens on its row. */
  roomId?: string;
  /** The gate answers something the host just tried (Go live refused, the hard stop): a warning edge, so it reads as the reason and not as an advert. */
  stop?: boolean;
  className?: string;
};

/**
 * The one way the product says "this is on the next plan". Every locked feature and every
 * refused action renders this, so a host learns one shape: what is locked, which plan has it,
 * what it would give them, and a priced button to the billing page. The button is primary on
 * purpose; an upgrade is the action we most want at this moment, and an underlined word in a
 * sentence is tertiary. Nothing else on the host side is terracotta-soft with a lock, so the
 * shape is recognisable at a glance.
 */
export function PlanGate({ title, unlock, current, children, variant = "block", stop, roomId, className }: Props) {
  const label = PLAN_LIMITS[unlock].label;
  const monthly = PRICE_LABELS[`${unlock}_monthly`];
  const yearly = PRICE_LABELS[`${unlock}_yearly`];
  const href = roomId ? `/host/billing#room-${roomId}` : "/host/billing";
  const cta = `Upgrade to ${label} · ${monthly.amount}/${monthly.period}`;

  if (variant === "inline") {
    return (
      <div role="status" className={cx("flex flex-wrap items-center gap-3 rounded-lg border bg-surface-inset px-4 py-3", stop ? "border-warning" : "border-line", className)}>
        <LockIcon className="size-4 shrink-0 text-ink-muted" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">{title}</span> {children}
        </p>
        <ButtonLink href={href} size="sm" data-track={`gate_${unlock}`}>
          {cta}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div role="status" className={cx("rounded-xl border bg-surface-raised p-6 shadow-card", stop ? "border-warning" : "border-line", className)}>
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
          <LockIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Eyebrow>
            On {current} · included in {label}
          </Eyebrow>
          <h3 className="mt-1 font-sans text-lg font-semibold text-ink">{title}</h3>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">{children}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ButtonLink href={href} data-track={`gate_${unlock}`}>
              {cta}
            </ButtonLink>
            <span className="text-xs text-ink-muted">
              or {yearly.amount} a year, two months free
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
