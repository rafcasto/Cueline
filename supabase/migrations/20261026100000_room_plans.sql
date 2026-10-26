-- The plan belongs to the room.
--
-- A room is either the organisation's single free room or a paid one: Starter and Pro are
-- bought per room, and every room after the first is a purchase. The plan therefore moves from
-- organisations to rooms (plan, plan_status) and the Stripe subscription behind it goes in
-- room_subscriptions, a table attendees cannot read (rooms themselves are public). The
-- organisation keeps the Stripe customer. A room without a paid plan is free while it is the
-- organisation's only room and locked otherwise (apps/web/src/lib/billing.ts, roomAccess), so a
-- free room never sits next to a paid one, through cancellation included. Rooms created by a
-- platform admin are complimentary: Pro limits, no subscription, never locked.
--
-- Written to run whether or not the previous migration's extra-room purchase (a one-off that
-- lasted a day) was applied: it removes those objects if they exist. Nothing is carried over
-- from the organisation's plan; there were no paid organisations when this landed, and the
-- seeded room is complimentary (seed.sql).

-- The extra-room purchase, superseded by per-room plans.
drop function if exists public.grant_extra_room(text, int, text);
drop table if exists public.room_purchases;
alter table public.organisations drop column if exists extra_rooms;

-- ---------------------------------------------------------------------------
-- The plan, per room
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column if not exists plan public.plan not null default 'free',
  add column if not exists plan_status public.plan_status not null default 'active',
  -- Created by a platform admin: runs at Pro, needs no subscription, is never locked.
  add column if not exists complimentary boolean not null default false;

-- Service-role writes (the Stripe webhook); org members may read their own.
create table if not exists public.room_subscriptions (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  stripe_mode public.stripe_mode not null,
  -- Null until the first payment comes through (status 'unpaid' on the room meanwhile).
  stripe_subscription_id text,
  price_lookup text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists room_subscriptions_stripe_idx on public.room_subscriptions (stripe_mode, stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists room_subscriptions_org_idx on public.room_subscriptions (org_id);
alter table public.room_subscriptions enable row level security;
drop policy if exists "members read room subscriptions" on public.room_subscriptions;
create policy "members read room subscriptions" on public.room_subscriptions for select to authenticated using (public.is_org_member(org_id));
drop trigger if exists room_subscriptions_touch on public.room_subscriptions;
create trigger room_subscriptions_touch before update on public.room_subscriptions for each row execute function public.touch_updated_at();

-- Sessions are now counted per room per billing period.
create index if not exists sessions_room_started_idx on public.sessions (room_id, started_at) where counted;

-- The organisation's plan columns go.
drop index if exists public.organisations_stripe_subscription_idx;
alter table public.organisations
  drop column if exists plan,
  drop column if exists plan_status,
  drop column if exists plan_price_lookup,
  drop column if exists plan_period_start,
  drop column if exists plan_period_end,
  drop column if exists stripe_subscription_id;

-- The seeded first room runs at Pro without a subscription.
update public.rooms set plan = 'pro', complimentary = true where id = '00000000-0000-0000-0000-000000000002';

-- PostgREST caches the schema; tell it the columns are there.
notify pgrst, 'reload schema';
