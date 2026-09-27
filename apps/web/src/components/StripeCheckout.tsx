"use client";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/env";

/** Stripe Embedded Checkout mounted inside the engagement panel; the viewer never leaves the room. */
export function StripeCheckout({ clientSecret }: { clientSecret: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let destroy = () => undefined as void;
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(publicEnv.stripePublishableKey);
      if (!stripe || cancelled) return;
      const checkout = await stripe.initEmbeddedCheckout({ clientSecret });
      if (cancelled) {
        checkout.destroy();
        return;
      }
      checkout.mount(el);
      destroy = () => checkout.destroy();
    })();
    return () => {
      cancelled = true;
      destroy();
    };
  }, [clientSecret]);
  return <div ref={ref} className="min-h-[420px]" />;
}
