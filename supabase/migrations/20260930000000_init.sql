-- Cueline: Phase 1 schema.
-- Every table carries org_id; every session-scoped table also carries session_id.
-- Realtime: clients never subscribe to postgres_changes. Writes hit the tables and a
-- trigger pushes a broadcast onto the `session:{id}` channel (see broadcast_session_change).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'host', 'presenter');
create type public.plan as enum ('free', 'starter', 'pro');
create type public.session_state as enum ('waiting', 'live', 'ended');
create type public.stage_state as enum ('viewer', 'invited', 'live', 'revoked');
create type public.activity_kind as enum ('poll', 'quiz', 'wordcloud', 'cta');
create type public.cta_action as enum ('view', 'tap', 'conversion');
create type public.order_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
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

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Rooms, presentations, sessions
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null unique,
  name text not null,
  branding jsonb not null default '{}'::jsonb,
  -- Waiting room: background media plus text elements positioned on a 16:9 canvas.
  -- { "background": { "type": "image"|"video"|"image_audio", "image_url", "video_url", "audio_url" },
  --   "elements": [ { "id", "type": "text", "x", "y", "w", "h", "text", "fontSize", "color", "align", "weight" } ] }
  waiting_room jsonb not null default '{"background":{"type":"image"},"elements":[]}'::jsonb,
  livekit_room text generated always as ('room_' || id::text) stored,
  created_at timestamptz not null default now()
);
create index rooms_org_idx on public.rooms(org_id);

-- A deck is a PDF in the `presentations` storage bucket; pages are rendered client-side.
create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  storage_path text not null,
  page_count int not null default 0,
  created_at timestamptz not null default now()
);
create index presentations_room_idx on public.presentations(room_id, created_at desc);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  presentation_id uuid references public.presentations(id) on delete set null,
  state public.session_state not null default 'waiting',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  hls_url text,
  egress_id text,
  recording_url text
);
create index sessions_room_idx on public.sessions(room_id);
create unique index sessions_one_open_per_room on public.sessions(room_id) where state <> 'ended';

-- Who is in the room (viewers pick a display name on join).
create table public.participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Activities: what the presenter authors (poll / quiz / word cloud / CTA) and
-- activity_runs: each time one is activated in a session.
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  kind public.activity_kind not null,
  title text not null check (char_length(title) between 1 and 300),
  -- poll/quiz: [ { "id": "a", "label": "Email", "correct": true } ]
  options jsonb not null default '[]'::jsonb,
  -- cta: { "destination": "stripe"|"embed"|"tab", "target": "..." }; wordcloud: { "max_words": 3 }
  config jsonb not null default '{}'::jsonb,
  timer_seconds int check (timer_seconds is null or timer_seconds between 5 and 3600),
  points int not null default 1000,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index activities_room_idx on public.activities(room_id, sort_order);

create table public.activity_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closes_at timestamptz,            -- opened_at + timer, set by trigger
  closed_at timestamptz,            -- presenter closed early, or timer expiry acknowledged
  results_shown_at timestamptz,     -- presenter chose to present results to participants
  hidden_at timestamptz             -- overlay dismissed for everyone
);
create index activity_runs_session_idx on public.activity_runs(session_id, opened_at desc);

create or replace function public.set_run_close()
returns trigger language plpgsql security definer set search_path = public as $$
declare t int;
begin
  select timer_seconds into t from public.activities where id = new.activity_id;
  if t is not null then
    new.closes_at := new.opened_at + make_interval(secs => t);
  end if;
  return new;
end;
$$;
create trigger activity_runs_close before insert on public.activity_runs
  for each row execute function public.set_run_close();

create table public.activity_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  run_id uuid not null references public.activity_runs(id) on delete cascade,
  user_id uuid not null,
  option_ids text[] not null default '{}',
  text_answer text check (text_answer is null or char_length(text_answer) <= 80),
  is_correct boolean,
  answered_ms int,
  created_at timestamptz not null default now(),
  unique (run_id, user_id)
);

-- Reject answers to a closed or expired run, and score quizzes server-side.
create or replace function public.check_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.activity_runs;
  a public.activities;
  correct text[];
begin
  select * into r from public.activity_runs where id = new.run_id;
  if r is null then raise exception 'run not found'; end if;
  if r.closed_at is not null or r.hidden_at is not null then raise exception 'run is closed'; end if;
  if r.closes_at is not null and now() > r.closes_at + interval '2 seconds' then raise exception 'time is up'; end if;
  new.session_id := r.session_id;
  new.org_id := r.org_id;
  new.answered_ms := greatest(0, (extract(epoch from (now() - r.opened_at)) * 1000)::int);
  select * into a from public.activities where id = r.activity_id;
  if a.kind = 'quiz' then
    select coalesce(array_agg(o->>'id'), '{}') into correct
      from jsonb_array_elements(a.options) o where (o->>'correct')::boolean;
    new.is_correct := (new.option_ids <@ correct) and (correct <@ new.option_ids);
  end if;
  return new;
end;
$$;
create trigger activity_responses_check before insert on public.activity_responses
  for each row execute function public.check_response();

-- One row per option per run so the overlay reads a small result set.
create view public.run_tallies with (security_invoker = true) as
  select
    r.id as run_id,
    r.session_id,
    o.ord - 1 as index,
    o.opt->>'id' as option_id,
    o.opt->>'label' as label,
    coalesce((o.opt->>'correct')::boolean, false) as correct,
    (select count(*) from public.activity_responses x where x.run_id = r.id and (o.opt->>'id') = any(x.option_ids))::int as votes
  from public.activity_runs r
  join public.activities a on a.id = r.activity_id
  cross join lateral jsonb_array_elements(a.options) with ordinality as o(opt, ord);

-- Quiz scoring: full points for a correct answer, scaled down by how long it took within the timer.
create view public.quiz_scores with (security_invoker = true) as
  select
    x.session_id,
    x.user_id,
    p.display_name,
    sum(case when x.is_correct then
      greatest(a.points / 2, a.points - (a.points / 2) * x.answered_ms / greatest(1, coalesce(a.timer_seconds, 60) * 1000))
      else 0 end)::int as points,
    count(*) filter (where x.is_correct)::int as correct,
    sum(x.answered_ms)::int as total_ms
  from public.activity_responses x
  join public.activity_runs r on r.id = x.run_id
  join public.activities a on a.id = r.activity_id and a.kind = 'quiz'
  left join public.participants p on p.session_id = x.session_id and p.user_id = x.user_id
  group by x.session_id, x.user_id, p.display_name;

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

-- Presenter navigated the deck. Viewers render the page themselves from the PDF.
create table public.slide_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  presentation_id uuid references public.presentations(id) on delete set null,
  page_index int not null default 0,
  server_ts timestamptz not null default now()
);
create index slide_events_session_idx on public.slide_events(session_id, server_ts desc);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
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

-- Reactions (like, heart, laugh, sad, wow, clap) are batched per second per kind, never one row per tap.
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
  org_id uuid references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  raised_at timestamptz not null default now(),
  cleared_at timestamptz
);
create unique index hand_raises_open_idx on public.hand_raises(session_id, user_id) where cleared_at is null;

create table public.cta_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  run_id uuid not null references public.activity_runs(id) on delete cascade,
  user_id uuid not null,
  page_index int,
  offset_seconds int not null,
  action public.cta_action not null,
  created_at timestamptz not null default now()
);
create index cta_events_run_idx on public.cta_events(run_id, action);

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
  sid uuid;
begin
  rec := coalesce(new, old);
  if tg_table_name = 'sessions' then sid := rec.id; else sid := rec.session_id; end if;
  perform realtime.broadcast_changes('session:' || sid::text, tg_table_name, tg_op, tg_table_name, tg_table_schema, new, old);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'participants', 'stage_roster', 'slide_events', 'activity_runs', 'activity_responses',
    'questions', 'question_votes', 'reactions', 'hand_raises'
  ] loop
    execute format(
      'create trigger %I_broadcast after insert or update or delete on public.%I
         for each row execute function public.broadcast_session_change()',
      t, t
    );
  end loop;
end $$;

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
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organisations', 'org_members', 'rooms', 'presentations', 'sessions', 'activities', 'activity_runs',
    'activity_responses', 'participants', 'stage_roster', 'slide_events', 'questions', 'question_votes',
    'reactions', 'hand_raises', 'cta_events', 'orders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "members read org" on public.organisations
  for select to authenticated using (public.is_org_member(id));
create policy "members read members" on public.org_members
  for select to authenticated using (public.is_org_member(org_id));

do $$
declare t text;
begin
  foreach t in array array[
    'rooms', 'presentations', 'sessions', 'activities', 'activity_runs', 'activity_responses', 'stage_roster',
    'slide_events', 'questions', 'reactions', 'hand_raises', 'cta_events', 'orders'
  ] loop
    execute format(
      'create policy "org members all" on public.%I for all to authenticated
         using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))',
      t
    );
  end loop;
end $$;
create policy "org members all participants" on public.participants for all to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and public.is_org_member(s.org_id)));

-- Viewer read access: what a participant needs to render the room.
create policy "public read rooms" on public.rooms for select to anon, authenticated using (true);
create policy "public read sessions" on public.sessions for select to anon, authenticated using (true);
create policy "viewers read presentations" on public.presentations for select to authenticated using (true);
create policy "viewers read activities" on public.activities for select to authenticated using (true);
create policy "viewers read runs" on public.activity_runs for select to authenticated using (true);
create policy "viewers read own responses" on public.activity_responses for select to authenticated using (user_id = auth.uid());
create policy "viewers read participants" on public.participants for select to authenticated using (true);
create policy "viewers read approved questions" on public.questions for select to authenticated using (approved or user_id = auth.uid());
create policy "viewers read question_votes" on public.question_votes for select to authenticated using (true);
create policy "viewers read own roster" on public.stage_roster for select to authenticated using (user_id = auth.uid());
create policy "viewers read slide_events" on public.slide_events for select to authenticated using (true);

-- Viewer write rights, always tied to their own uid.
create policy "viewers join" on public.participants
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers rename self" on public.participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "viewers answer" on public.activity_responses
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers ask" on public.questions
  for insert to authenticated with check (user_id = auth.uid() and approved = false);
create policy "viewers upvote" on public.question_votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers raise hand" on public.hand_raises
  for insert to authenticated with check (user_id = auth.uid());
create policy "viewers lower own hand" on public.hand_raises
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "viewers log cta" on public.cta_events
  for insert to authenticated with check (user_id = auth.uid());

-- Reactions: viewers call bump_reaction(), which upserts the per-second bucket.
create or replace function public.bump_reaction(p_session uuid, p_kind text, p_count int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('like', 'heart', 'laugh', 'sad', 'wow', 'clap') then raise exception 'unknown reaction'; end if;
  select org_id into v_org from public.sessions where id = p_session and state = 'live';
  if v_org is null then raise exception 'no live session'; end if;
  insert into public.reactions (org_id, session_id, kind, bucket_ts, count)
  values (v_org, p_session, p_kind, date_trunc('second', now()), greatest(1, least(p_count, 50)))
  on conflict (session_id, kind, bucket_ts)
  do update set count = public.reactions.count + excluded.count;
end;
$$;

-- Fill org_id on viewer inserts so clients never have to know the org.
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
  foreach t in array array['questions', 'hand_raises', 'cta_events'] loop
    execute format(
      'create trigger %I_fill_org before insert on public.%I
         for each row execute function public.fill_org_from_session()', t, t);
  end loop;
end $$;

grant execute on function public.bump_reaction(uuid, text, int) to authenticated;
grant select on public.run_tallies, public.quiz_scores to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: decks and waiting-room media. Public read; org members write under <org_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('presentations', 'presentations', true, 52428800, array['application/pdf']),
  ('media', 'media', true, 104857600, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'])
on conflict (id) do nothing;

create policy "public read cueline buckets" on storage.objects
  for select to anon, authenticated using (bucket_id in ('presentations', 'media'));
create policy "org members write own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('presentations', 'media') and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "org members delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id in ('presentations', 'media') and public.is_org_member(((storage.foldername(name))[1])::uuid));
