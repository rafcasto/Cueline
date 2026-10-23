import { dispatch } from "@/lib/email/schedule";

/**
 * Safety-net dispatcher, hit by the Vercel cron in vercel.json. Registrations and host edits
 * dispatch on their own; this run picks up reminders that were beyond Resend's scheduling
 * horizon at the time. Failed rows are not retried here; they stay visible to the host.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json(await dispatch());
}
