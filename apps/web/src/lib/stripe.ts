/**
 * Stripe in two modes at once. Both key sets sit in the environment; `app_settings.stripe_mode`
 * says which one new checkouts and portal sessions use, and a platform admin flips it from
 * /host/billing. Webhooks from either mode are accepted (each mode has its own signing secret)
 * and an organisation keeps using the mode its subscription was created in.
 */
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PriceLookup } from "@/lib/plans";

export type StripeMode = "test" | "live";
export const STRIPE_MODES: StripeMode[] = ["test", "live"];

export function isStripeMode(v: unknown): v is StripeMode {
  return v === "test" || v === "live";
}

/**
 * Keys for a mode: STRIPE_SECRET_KEY_TEST / STRIPE_SECRET_KEY_LIVE and so on. The unsuffixed
 * names from before the switch existed still work and are read as the key for whichever mode
 * their prefix says (sk_test_ / sk_live_, pk_test_ / pk_live_).
 */
export function stripeKeys(mode: StripeMode): { secret: string | null; webhookSecret: string | null; publishable: string | null } {
  const M = mode.toUpperCase();
  const legacy = (name: string, prefix: string) => {
    const v = process.env[name];
    return v && v.startsWith(prefix) ? v : null;
  };
  return {
    secret: process.env[`STRIPE_SECRET_KEY_${M}`] || legacy("STRIPE_SECRET_KEY", `sk_${mode}_`) || legacy("STRIPE_SECRET_KEY", `rk_${mode}_`),
    webhookSecret: process.env[`STRIPE_WEBHOOK_SECRET_${M}`] || (mode === "test" ? process.env.STRIPE_WEBHOOK_SECRET || null : null),
    publishable: process.env[`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_${M}`] || legacy("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `pk_${mode}_`),
  };
}

export function modeConfigured(mode: StripeMode): boolean {
  return !!stripeKeys(mode).secret;
}

const clients: Partial<Record<StripeMode, Stripe>> = {};
export function stripeFor(mode: StripeMode): Stripe {
  const existing = clients[mode];
  if (existing) return existing;
  const { secret } = stripeKeys(mode);
  if (!secret) throw new Error(`Stripe ${mode} mode is not configured (STRIPE_SECRET_KEY_${mode.toUpperCase()})`);
  const c = new Stripe(secret);
  clients[mode] = c;
  return c;
}

// The active mode is read on every checkout but cached briefly so a page with several buttons
// does not hit the database once per button.
let cached: { mode: StripeMode; at: number } | null = null;
const CACHE_MS = 15_000;

export async function activeStripeMode(): Promise<StripeMode> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.mode;
  const { data } = await supabaseAdmin().from("app_settings").select("value").eq("key", "stripe_mode").maybeSingle();
  const mode = isStripeMode(data?.value) ? data.value : "test";
  cached = { mode, at: Date.now() };
  return mode;
}

export async function setActiveStripeMode(mode: StripeMode, userId: string) {
  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert({ key: "stripe_mode", value: mode, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "key" });
  if (error) throw error;
  cached = { mode, at: Date.now() };
}

/** The Stripe client for whatever mode is active right now. */
export async function stripe(): Promise<Stripe> {
  return stripeFor(await activeStripeMode());
}

// Price ids differ between modes; the app only knows lookup keys.
const prices: Record<StripeMode, Map<string, string>> = { test: new Map(), live: new Map() };
export async function priceIdFor(mode: StripeMode, lookupKey: PriceLookup): Promise<string> {
  const hit = prices[mode].get(lookupKey);
  if (hit) return hit;
  const list = await stripeFor(mode).prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const id = list.data[0]?.id;
  if (!id) throw new Error(`No active Stripe price with lookup key "${lookupKey}" in ${mode} mode`);
  prices[mode].set(lookupKey, id);
  return id;
}

/**
 * Verify a webhook against each configured mode's secret; the one that verifies tells us the
 * mode. `event.livemode` is checked against it so a secret pasted into the wrong slot fails.
 */
export function verifyWebhook(raw: string, signature: string): { event: Stripe.Event; mode: StripeMode } {
  let lastError: Error | null = null;
  for (const mode of STRIPE_MODES) {
    const { webhookSecret, secret } = stripeKeys(mode);
    if (!webhookSecret) continue;
    try {
      const event = (secret ? stripeFor(mode) : new Stripe("sk_unused")).webhooks.constructEvent(raw, signature, webhookSecret);
      if (event.livemode !== (mode === "live")) throw new Error(`event livemode=${event.livemode} does not match the ${mode} webhook secret`);
      return { event, mode };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error("no Stripe webhook secret configured");
}
