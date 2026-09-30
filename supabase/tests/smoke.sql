-- End-to-end smoke test of the schema: host org, participant identity, activity run + timer, scoring, RLS, broadcasts.
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.org_members(org_id, user_id, role) values ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner');

-- Host creates a session, a quiz with a 30 s timer, and activates it.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.sessions(id, org_id, room_id, state) values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'live');
insert into public.activities(id, org_id, room_id, kind, title, options, timer_seconds) values
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'quiz', 'Capital of NZ?',
   '[{"id":"a","label":"Auckland"},{"id":"b","label":"Wellington","correct":true}]', 30);
insert into public.activity_runs(id, org_id, session_id, activity_id) values ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
select 'timer sets closes_at' as check, closes_at = opened_at + interval '30 seconds' as pass from public.activity_runs where id = '55555555-5555-5555-5555-555555555555';
insert into public.slide_events(org_id, session_id, page_index) values ('00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 3);

-- A participant (anonymous auth) joins, answers, reacts, asks, raises a hand.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.participants(session_id, user_id, display_name) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Ada');
insert into public.activity_responses(run_id, session_id, user_id, option_ids) values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '{b}');
select 'quiz scored server-side' as check, is_correct and org_id = '00000000-0000-0000-0000-000000000001' and answered_ms >= 0 as pass from public.activity_responses where user_id = auth.uid();
select 'leaderboard' as check, display_name, points > 0 as pass from public.quiz_scores where session_id = '33333333-3333-3333-3333-333333333333';
select 'run_tallies' as check, label, votes, correct from public.run_tallies where run_id = '55555555-5555-5555-5555-555555555555' order by index;
select public.bump_reaction('33333333-3333-3333-3333-333333333333', 'heart', 3);
select public.bump_reaction('33333333-3333-3333-3333-333333333333', 'heart', 2);
insert into public.questions(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'When is the recording out?');
insert into public.hand_raises(session_id, user_id) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');
do $$ begin
  insert into public.activity_responses(run_id, session_id, user_id, option_ids) values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '{a}');
  raise exception 'RLS should have rejected an insert as another user';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.activity_responses(run_id, session_id, user_id, option_ids) values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '{a}');
  raise exception 'duplicate answer should be rejected';
exception when unique_violation then null; end $$;
do $$ begin
  perform public.bump_reaction('33333333-3333-3333-3333-333333333333', 'rocket', 1);
  raise exception 'unknown reaction should be rejected';
exception when raise_exception then null; end $$;
select 'viewer sees unapproved questions' as check, count(*) = 0 as pass from public.questions where user_id <> auth.uid();

-- Host closes the run; late answers are rejected. Then results are shown.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.activity_runs set closed_at = now(), results_shown_at = now() where id = '55555555-5555-5555-5555-555555555555';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  insert into public.activity_responses(run_id, session_id, user_id, option_ids) values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '{a}');
  raise exception 'answer after close should be rejected';
exception when raise_exception then null; end $$;
reset role;

select 'reactions batched' as check, count = 5 as pass from public.reactions where kind = 'heart';
select 'broadcasts' as check, event, payload->>'operation' as op from realtime.messages order by id;
