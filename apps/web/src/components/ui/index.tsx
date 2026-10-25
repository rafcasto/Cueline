import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/*
 * The primitives every screen is built from. One place for the type scale, the control
 * heights, the border radius and the shadows, so screens only decide hierarchy and spacing.
 */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-contrast shadow-card hover:bg-brand-hover",
  secondary: "border border-line-strong bg-surface-raised text-ink shadow-card hover:bg-surface-inset",
  ghost: "text-ink-muted hover:bg-surface-inset hover:text-ink",
  danger: "border border-red-200 bg-surface-raised text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950",
  success: "bg-emerald-600 text-white shadow-card hover:bg-emerald-700",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonVariant; size?: ButtonSize; external?: boolean };
export function ButtonLink({ href, variant = "primary", size = "md", className, external, children, ...rest }: ButtonLinkProps) {
  const cls = buttonClass(variant, size, className);
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
const controlBase =
  "w-full rounded-lg border border-line-strong bg-surface-raised text-ink placeholder:text-ink-faint shadow-card transition-colors focus:border-focus focus-visible:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-60 read-only:bg-surface-inset";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlBase, "h-10 px-3 text-sm", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlBase, "px-3 py-2 text-sm leading-relaxed", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlBase, "h-10 appearance-none bg-[length:16px] bg-[position:right_10px_center] bg-no-repeat px-3 pr-9 text-sm", className)} style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%2394a3b8' stroke-width='1.5'><path d='M6 8l4 4 4-4'/></svg>\")" }} {...rest}>
      {children}
    </select>
  );
}

/** Label above, control, then hint or error. Labels are deliberately quieter than values. */
export function Field({ label, hint, error, htmlFor, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Small uppercase label used over a value, a stat or a section of a card. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-xs font-semibold uppercase tracking-wider text-ink-muted", className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={cx("rounded-xl border border-line bg-surface-raised shadow-card", padded && "p-6", className)}>{children}</section>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</div>
    </div>
  );
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "live";
const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-inset text-ink-muted",
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  danger: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  live: "bg-red-600 text-white",
};
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)}>
      {dot && <span className={cx("size-1.5 rounded-full", tone === "live" ? "animate-pulse bg-white" : "bg-current")} />}
      {children}
    </span>
  );
}

const alertTones: Record<Exclude<Tone, "live">, string> = {
  neutral: "border-line bg-surface-inset text-ink",
  brand: "border-indigo-200 bg-brand-soft text-brand-ink dark:border-indigo-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  danger: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
};
export function Alert({ tone = "neutral", title, children, className }: { tone?: Exclude<Tone, "live">; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm leading-relaxed", alertTones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-ink">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Segmented control / tab strip. */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-inset p-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
            value === it.value ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted hover:text-ink",
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cx("rounded-full px-1.5 text-xs tabular-nums", value === it.value ? "bg-brand-soft text-brand-ink" : "bg-surface-raised text-ink-muted")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Toggle switch. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-brand" : "bg-line-strong")}
    >
      <span className={cx("inline-block size-5 rounded-full bg-white shadow-card transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-ink", className)}>
      <svg viewBox="0 0 24 24" className="size-6 text-brand" aria-hidden>
        <rect x="2" y="4" width="20" height="14" rx="3" fill="currentColor" opacity="0.15" />
        <rect x="2" y="4" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.75" fill="none" />
        <path d="M7 11h4M7 14h7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="16.5" cy="9.5" r="1.75" fill="currentColor" />
        <path d="M9 21h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      {wordmark && <span>Tertulia</span>}
    </span>
  );
}

/** Consistent page title block with optional eyebrow, description and actions on the right. */
export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inline text link. */
export function TextLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const cls = cx("font-medium text-brand underline-offset-4 hover:underline", className);
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
