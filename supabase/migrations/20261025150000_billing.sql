-- Billing: plans paid through Stripe, event passes, and the platform switch between the
-- Stripe sandbox and the live account.
--
-- The free tier is the default of organisations.plan. Starter and Pro are Stripe
-- subscriptions; an event pass is a one-off payment that adds one session to the month it is
-- used in. Participant caps, session caps and minutes are not stored in Stripe: they live in
-- apps/web/src/lib/plans.ts, and the webhook only reads the product's `plan` metadata.
--
-- Both Stripe modes are configured at once (two key sets in the environment); app_settings
-- holds which one new checkouts use. An organisation remembers the mode its subscription was
-- made in, so a sandbox subscription keeps renewing against the sandbox after the switch to
-- live, and the webhook accepts events from either mode and routes them by that column.

create type public.stripe_mode as enum ('test', 'live');
create type public.plan_status as enum ('active', 'past_due', 'canceled');

-- ---------------------------------------------------------------------------
-- Platform settings and platform admins (the "super user")
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
-- Service role only: no policies. The API reads and writes it after checking platform_admins.
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('stripe_mode', '"test"'::jsonb) on conflict (key) do nothing;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- A user can see whether they are one (the billing page shows the switch); nobody can list them.
create policy "admins see themselves" on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Organisations: the subscription
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column stripe_mode public.stripe_mode,
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column plan_status public.plan_status not null default 'active',
  add column plan_price_lookup text,
  add column plan_period_start timestamptz,
  add column plan_period_end timestamptz;
create unique index organisations_stripe_customer_idx on public.organisations (stripe_mode, stripe_customer_id) where stripe_customer_id is not null;
create unique index organisations_stripe_subscription_idx on public.organisations (stripe_mode, stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.orders add column stripe_mode public.stripe_mode not null default 'test';

-- ---------------------------------------------------------------------------
-- Event passes
-- ---------------------------------------------------------------------------
create table public.event_passes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  -- The event it was bought for, when bought from an event; any unused paid pass can be spent.
  invite_id uuid references public.invites(id) on delete set null,
  stripe_mode public.stripe_mode not null,
  stripe_session_id text not null unique,
  status public.order_status not null default 'pending',
  amount_total int,
  currency text,
  used_by_session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_passes_org_idx on public.event_passes (org_id, status, used_by_session_id);
alter table public.event_passes enable row level security;
create policy "members read passes" on public.event_passes for select to authenticated using (public.is_org_member(org_id));

-- Webhook idempotency: Stripe delivers an event more than once; the first insert wins.
create table public.stripe_events (
  id text primary key,
  stripe_mode public.stripe_mode not null,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------------------
-- Sessions: what the plan granted this session when it went live
-- ---------------------------------------------------------------------------
alter table public.sessions
  -- Counts against the plan's sessions for the month. Set at go-live; cleared when a false start
  -- (ended within two minutes, nobody joined) is refunded.
  add column counted boolean not null default false,
  add column event_pass_id uuid references public.event_passes(id) on delete set null,
  add column max_participants int,
  -- Hard stop: the plan's session length counted from started_at.
  add column ends_by timestamptz;
create index sessions_org_started_idx on public.sessions (org_id, started_at) where counted;
