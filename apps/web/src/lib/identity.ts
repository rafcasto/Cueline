/**
 * Turns the failure of the attendee's anonymous sign-in into a message that names the
 * cause. The common ones are project settings, not the attendee's browser: the hosted
 * Supabase project has anonymous sign-ins off, captcha on, or the per-IP rate limit hit.
 */
type AuthLike = { code?: unknown; status?: unknown; name?: unknown; message?: unknown } | null | undefined;

export function viewerIdentityMessage(err: unknown): string {
  const e = (typeof err === "object" ? err : null) as AuthLike;
  const code = typeof e?.code === "string" ? e.code : "";
  const status = typeof e?.status === "number" ? e.status : 0;
  const name = typeof e?.name === "string" ? e.name : "";
  const message = typeof e?.message === "string" ? e.message : String(err ?? "");

  if (/supabaseUrl is required|supabaseKey is required|Missing environment variable/i.test(message)) {
    return "The app is missing its Supabase URL or anon key (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Set them where the app is deployed and redeploy.";
  }
  if (code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(message)) {
    return "Attendee sign-in is switched off: anonymous sign-ins are disabled in the Supabase project. The host needs to turn on “Allow anonymous sign-ins” under Authentication → Sign In / Providers, then reload this page.";
  }
  if (code === "signup_disabled") {
    return "Sign-ups are disabled in the Supabase project, which also blocks attendees. The host needs to allow new users under Authentication → Sign In / Providers.";
  }
  if (code === "captcha_failed") {
    return "The sign-in captcha failed. Captcha protection is on in the Supabase project but this app does not send a captcha token; turn it off under Authentication → Attack Protection.";
  }
  if (code === "over_request_rate_limit" || status === 429) {
    return "Too many new attendee sessions from this network in the last hour (the Supabase anonymous sign-in rate limit). Wait a few minutes and reload, or raise the limit under Authentication → Rate Limits.";
  }
  if (name === "AuthRetryableFetchError" || /Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "Could not reach the sign-in service. Check your connection, or an ad blocker or VPN that blocks the Supabase domain, then reload.";
  }
  return `Could not start a session in this browser${message ? ` (${message})` : ""}. If this keeps happening, cookies may be blocked for this site.`;
}
