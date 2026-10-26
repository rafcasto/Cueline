-- Enum values the next migration builds on. Postgres cannot use a new enum value in the
-- transaction that adds it, so they live here on their own.
--
-- 'waitlist': a third kind of email step, the note sent to someone who registers after the
-- seats are gone and lands on the waiting list.
-- 'unpaid': a room bought at checkout whose first payment has not come through yet.
alter type public.invite_email_kind add value if not exists 'waitlist';
alter type public.plan_status add value if not exists 'unpaid';
