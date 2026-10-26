-- A third kind of email step: the note sent to someone who registers after the seats are
-- gone and lands on the waiting list. Postgres cannot use a new enum value in the transaction
-- that adds it, so the value lives in its own migration and the next one builds on it.
alter type public.invite_email_kind add value if not exists 'waitlist';
