-- Insights are a Pro feature, and until now only the host panel's tab said so: the
-- session_engagement view was readable by any org member with the anon key and their
-- session. The view is now read only by the service role, through POST /api/insights,
-- which checks the room's plan first (lib/plans PLAN_LIMITS.insights). The tables the view
-- reads are unchanged; the Event tab still sees registrations and who joined.
revoke select on public.session_engagement from anon, authenticated;
