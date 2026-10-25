import { handler, json, readJson, requirePlatformAdmin, requireUser } from "@/lib/auth";
import { activeStripeMode, isStripeMode, modeConfigured, setActiveStripeMode } from "@/lib/stripe";

/** Which Stripe account new payments go to. Platform admins only; the setting is global. */
export const GET = handler(async (req) => {
  const { user } = await requireUser(req);
  await requirePlatformAdmin(user.id);
  return json({ mode: await activeStripeMode(), configured: { test: modeConfigured("test"), live: modeConfigured("live") } });
});

export const POST = handler(async (req) => {
  const { user } = await requireUser(req);
  await requirePlatformAdmin(user.id);
  const body = await readJson<{ mode: unknown }>(req);
  if (!isStripeMode(body.mode)) return json({ error: "mode must be test or live" }, { status: 400 });
  if (!modeConfigured(body.mode)) return json({ error: `Stripe ${body.mode} keys are not set on the server` }, { status: 409 });
  await setActiveStripeMode(body.mode, user.id);
  return json({ mode: body.mode });
});
