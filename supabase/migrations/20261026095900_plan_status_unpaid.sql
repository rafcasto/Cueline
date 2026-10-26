-- 'unpaid': a room bought at checkout whose first payment has not come through yet. Postgres
-- cannot use a new enum value in the transaction that adds it, so it lives here on its own.
alter type public.plan_status add value if not exists 'unpaid';
