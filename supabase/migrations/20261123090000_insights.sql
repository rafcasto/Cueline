-- Insights for the host: who registered and who turned up, how engaged each attendee was
-- (the buying-intent signal), and how well they fit (from scored poll answers).
--
-- Fit. A poll or quiz option may carry `fit` (0–10) in activities.options:
--   [ { "id": "a", "label": "I run a team of 10+", "fit": 10 }, ... ]
-- An attendee's fit points are the fit of every option they picked, over every run of the
-- session; the maximum is the best option of every run whose activity has any fit at all.
-- The percentage and the four-way split (intent × fit) are computed in the app from this view.
--
-- Reactions are batched per second per kind, so until now nobody could say who reacted.
-- bump_reaction() now also keeps a count per (session, attendee); the batched buckets are
-- untouched and still drive the floating animation.

create table public.participant_reactions (
  org_id uuid not null references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  count int not null default 0,
  primary key (session_id, user_id)
);
alter table public.participant_reactions enable row level security;
create policy "org members read" on public.participant_reactions for select to authenticated using (public.is_org_member(org_id));

create or replace function public.bump_reaction(p_session uuid, p_kind text, p_count int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('like', 'heart', 'laugh', 'sad', 'wow', 'clap') then raise exception 'unknown reaction'; end if;
  select org_id into v_org from public.sessions where id = p_session and state = 'live';
  if v_org is null then raise exception 'no live session'; end if;
  n := greatest(1, least(p_count, 50));
  insert into public.reactions (org_id, session_id, kind, bucket_ts, count)
  values (v_org, p_session, p_kind, date_trunc('second', now()), n)
  on conflict (session_id, kind, bucket_ts)
  do update set count = public.reactions.count + excluded.count;
  insert into public.participant_reactions (org_id, session_id, user_id, count)
  values (v_org, p_session, auth.uid(), n)
  on conflict (session_id, user_id)
  do update set count = public.participant_reactions.count + excluded.count;
end;
$$;

-- One row per attendee per session: every signal the engagement score reads, plus the fit
-- points. Correlated subqueries, not joins, so a person with nothing in one table still gets a
-- row and the counts never multiply. The session-wide figures (runs offered, fit maximum) are
-- repeated on every row so one read has everything.
create view public.session_engagement with (security_invoker = true) as
  select
    p.session_id,
    p.user_id,
    p.display_name,
    p.joined_at,
    (select count(*) from public.activity_runs r join public.activities a on a.id = r.activity_id
      where r.session_id = p.session_id and a.kind <> 'cta')::int as runs_total,
    (select count(*) from public.activity_runs r join public.activities a on a.id = r.activity_id
      where r.session_id = p.session_id and a.kind = 'cta')::int as cta_runs,
    (select count(*) from public.activity_responses x
      where x.session_id = p.session_id and x.user_id = p.user_id)::int as answers,
    (select count(*) from public.questions q
      where q.session_id = p.session_id and q.user_id = p.user_id)::int as questions,
    (select count(*) from public.question_votes v
      where v.session_id = p.session_id and v.user_id = p.user_id)::int as upvotes,
    (select count(*) from public.chat_messages c
      where c.session_id = p.session_id and c.user_id = p.user_id and c.hidden_at is null)::int as chat_messages,
    (select count(*) from public.hand_raises h
      where h.session_id = p.session_id and h.user_id = p.user_id)::int as hand_raises,
    coalesce((select pr.count from public.participant_reactions pr
      where pr.session_id = p.session_id and pr.user_id = p.user_id), 0)::int as reactions,
    (select count(distinct e.run_id) from public.cta_events e
      where e.session_id = p.session_id and e.user_id = p.user_id and e.action = 'view')::int as cta_views,
    (select count(*) from public.cta_events e
      where e.session_id = p.session_id and e.user_id = p.user_id and e.action = 'tap')::int as cta_taps,
    (select count(*) from public.orders o join public.cta_events e on e.id = o.cta_event_id
      where e.session_id = p.session_id and e.user_id = p.user_id and o.status = 'paid')::int as orders_paid,
    coalesce((
      select sum(coalesce((o.opt->>'fit')::numeric, 0))
      from public.activity_responses x
      join public.activity_runs r on r.id = x.run_id
      join public.activities a on a.id = r.activity_id
      cross join lateral jsonb_array_elements(a.options) as o(opt)
      where x.session_id = p.session_id and x.user_id = p.user_id and (o.opt->>'id') = any(x.option_ids)
    ), 0)::int as fit_points,
    coalesce((
      select sum(m.best)
      from public.activity_runs r
      join public.activities a on a.id = r.activity_id
      cross join lateral (
        select max(coalesce((o.opt->>'fit')::numeric, 0)) as best from jsonb_array_elements(a.options) as o(opt)
      ) as m
      where r.session_id = p.session_id and m.best > 0
    ), 0)::int as fit_max
  from public.participants p;

grant select on public.session_engagement to authenticated;
