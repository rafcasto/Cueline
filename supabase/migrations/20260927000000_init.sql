-- Cueline: Phase 1 schema.
-- Every table carries org_id; every session-scoped table also carries session_id.
-- Realtime: clients never subscribe to postgres_changes. Writes hit the tables and a
-- trigger pushes a broadcast onto the `session:{id}` channel (see broadcast_session_change).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'host', 'presenter');
create type public.plan as enum ('free', 'starter', 'pro');
create type public.stage_state as enum ('viewer', 'invited', 'live', 'revoked');
create type public.cue_kind as enum ('poll', 'multipoll', 'text', 'cta');
create type public.cta_destination as enum ('stripe', 'embed', 'tab');
create type public.cta_action as enum ('view', 'tap', 'conversion');
create type public.order_status as enum ('pending', 'paid', 'failed', 'refunded');

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan public.plan not null default 'free',
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'host',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

-- Helper used by every host-side RLS policy.
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Rooms, sessions, decks
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null,
  name text not null,
  branding jsonb not null default '{}'::jsonb,
  livekit_room text generated always as ('room_' || id::text) stored,
  created_at timestamptz not null default now(),
  unique (slug)
);
create index rooms_org_idx on public.rooms(org_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  presentation_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  hls_url text,
  egress_id text,
  recording_url text
);
create index sessions_room_idx on public.sessions(room_id);
create index sessions_presentation_live_idx on public.sessions(presentation_id) where ended_at is null;

-- Slides synced from the Slides API. One row per slide, cue payloads parsed from speaker notes.
create table public.deck_slides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  presentation_id text not null,
  slide_object_id text not null,
  index int not null,
  notes text,
  poll_payload jsonb,
  cta_payload jsonb,
  synced_at timestamptz not null default now(),
  unique (presentation_id, slide_object_id)
);
create index deck_slides_presentation_idx on public.deck_slides(presentation_id, index);

-- ---------------------------------------------------------------------------
-- Session-scoped tables
-- ---------------------------------------------------------------------------
create table public.stage_roster (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  state public.stage_state not null default 'viewer',
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.slide_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  slide_object_id text not null,
  index int,
  server_ts timestamptz not null default now(),
  forced boolean not null default false,
  poll_id uuid,
  cta_id uuid
);
create index slide_events_session_idx on public.slide_events(session_id, server_ts desc);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  slide_object_id text,
  kind public.cue_kind not null default 'poll',
  question text not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index polls_session_idx on public.polls(session_id);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  poll_id uuid not null references public.polls(id) on delete cascade,
  index int not null,
  label text not null,
  unique (poll_id, index)
);

create table public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null,
  option_ids uuid[] not null default '{}',
  text_answer text,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

-- One row per option per poll, so the overlay reads a single small result set.
create view public.poll_tallies with (security_invoker = true) as
  select
    o.poll_id,
    o.session_id,
    o.id as option_id,
    o.index,
    o.label,
    count(r.id)::int as votes
  from public.poll_options o
  left join public.poll_responses r
    on r.poll_id = o.poll_id and o.id = any(r.option_ids)
  group by o.poll_id, o.session_id, o.id, o.index, o.label;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  body text not null check (char_length(body) between 1 and 500),
  approved boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index questions_session_idx on public.questions(session_id, created_at);

create table public.question_votes (
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- Reactions are batched per second per kind, never one row per tap.
create table public.reactions (
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  kind text not null,
  bucket_ts timestamptz not null,
  count int not null default 0,
  primary key (session_id, kind, bucket_ts)
);

create table public.hand_raises (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  raised_at timestamptz not null default now(),
  cleared_at timestamptz
);
create unique index hand_raises_open_idx on public.hand_raises(session_id, user_id) where cleared_at is null;

create table public.ctas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  slide_object_id text,
  label text not null,
  destination public.cta_destination not null,
  target text not null, -- URL or Stripe price id
  created_at timestamptz not null default now()
);

create table public.cta_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  cta_id uuid not null references public.ctas(id) on delete cascade,
  user_id uuid not null,
  slide_id text,
  offset_seconds int not null,
  action public.cta_action not null,
  created_at timestamptz not null default now()
);
create index cta_events_cta_idx on public.cta_events(cta_id, action);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  cta_event_id uuid references public.cta_events(id) on delete set null,
  stripe_session_id text not null unique,
  status public.order_status not null default 'pending',
  amount_total int,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Realtime: table write -> trigger -> broadcast on session:{id}
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_session_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec record;
begin
  rec := coalesce(new, old);
  perform realtime.broadcast_changes(
    'session:' || rec.session_id::text,
    tg_table_name,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'stage_roster', 'slide_events', 'polls', 'poll_options', 'poll_responses',
    'questions', 'question_votes', 'reactions', 'hand_raises', 'ctas'
  ] loop
    execute format(
      'create trigger %I_broadcast after insert or update or delete on public.%I
         for each row execute function public.broadcast_session_change()',
      t, t
    );
  end loop;
end $$;

-- Session channels are private; anyone who can read the session can listen.
create policy "session channel listen" on realtime.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where 'session:' || s.id::text = realtime.topic()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS
-- Hosts: org membership. Viewers: anonymous auth, insert-only on engagement tables
-- (and read on what they need to render). Vercel functions use the service key.
-- ---------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.org_members   enable row level security;
alter table public.rooms         enable row level security;
alter table public.sessions      enable row level security;
alter table public.deck_slides   enable row level security;
alter table public.stage_roster  enable row level security;
alter table public.slide_events  enable row level security;
alter table public.polls         enable row level security;
alter table public.poll_options  enable row level security;
alter table public.poll_responses enable row level security;
alter table public.questions     enable row level security;
alter table public.question_votes enable row level security;
alter table public.reactions     enable row level security;
alter table public.hand_raises   enable row level security;
alter table public.ctas          enable row level security;
alter table public.cta_events    enable row level security;
alter table public.orders        enable row level security;

create policy "members read org" on public.organisations
  for select to authenticated using (public.is_org_member(id));

create policy "members read members" on public.org_members
  for select to authenticated using (public.is_org_member(org_id));

-- Host-side full access on org-owned tables.
do $$
declare t text;
begin
  foreach t in array array[
    'rooms', 'sessions', 'deck_slides', 'stage_roster', 'slide_events', 'polls',
    'poll_options', 'poll_responses', 'questions', 'reactions', 'hand_raises',
    'ctas', 'cta_events', 'orders'
  ] loop
    execute format(
      'create policy "org members all" on public.%I for all to authenticated
         using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))',
      t
    );
  end loop;
end $$;

-- Viewer read access: anything needed to render a live session.
create policy "public read rooms" on public.rooms for select to anon, authenticated using (true);
create policy "public read live sessions" on public.sessions for select to anon, authenticated using (true);
create policy "viewers read polls" on public.polls for select to authenticated using (true);
create policy "viewers read poll_options" on public.poll_options for select to authenticated using (true);
create policy "viewers read own responses" on public.poll_responses for select to authenticated using (user_id = auth.uid());
create policy "viewers read approved questions" on public.questions for select to authenticated using (approved or user_id = auth.uid());
create policy "viewers read question_votes" on public.question_votes for select to authenticated using (true);
create policy "viewers read ctas" on public.ctas for select to authenticated using (true);
create policy "viewers read own roster" on public.stage_roster for select to authenticated using (user_id = auth.uid());
create policy "viewers read slide_events" on public.slide_events for select to authenticated using (true);

-- Viewer insert-only rights, tied to their own uid.
create policy "viewers insert responses" on public.poll_responses
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers insert questions" on public.questions
  for insert to authenticated with check (user_id = auth.uid() and approved = false);
create policy "viewers insert question_votes" on public.question_votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers insert hand_raises" on public.hand_raises
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers lower own hand" on public.hand_raises
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "viewers insert cta_events" on public.cta_events
  for insert to authenticated with check (user_id = auth.uid());

-- Reactions: viewers call bump_reaction(), which upserts the per-second bucket.
create or replace function public.bump_reaction(p_session uuid, p_kind text, p_count int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select org_id into v_org from public.sessions where id = p_session and ended_at is null;
  if v_org is null then
    raise exception 'no live session';
  end if;
  insert into public.reactions (org_id, session_id, kind, bucket_ts, count)
  values (v_org, p_session, p_kind, date_trunc('second', now()), greatest(1, least(p_count, 50)))
  on conflict (session_id, kind, bucket_ts)
  do update set count = public.reactions.count + excluded.count;
end;
$$;

-- Fill org_id/session_id on viewer inserts so clients never have to know the org.
create or replace function public.fill_org_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    select org_id into new.org_id from public.sessions where id = new.session_id;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['poll_responses', 'questions', 'hand_raises', 'cta_events'] loop
    execute format('alter table public.%I alter column org_id drop not null', t);
    execute format(
      'create trigger %I_fill_org before insert on public.%I
         for each row execute function public.fill_org_from_session()',
      t, t
    );
  end loop;
end $$;

grant execute on function public.bump_reaction(uuid, text, int) to authenticated;
grant select on public.poll_tallies to authenticated;
