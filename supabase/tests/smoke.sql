-- End-to-end smoke test of the schema: host org, viewer identity, cue flow, tallies, broadcasts.
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.org_members(org_id, user_id, role) values ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner');
insert into public.sessions(id, org_id, room_id, presentation_id) values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'deck1');
insert into public.polls(id, org_id, session_id, slide_object_id, kind, question) values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'id.g1', 'poll', 'Leads?');
insert into public.poll_options(id, org_id, session_id, poll_id, index, label) values
  ('55555555-5555-5555-5555-555555555551', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 0, 'Email'),
  ('55555555-5555-5555-5555-555555555552', '00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 1, 'LinkedIn');
insert into public.slide_events(org_id, session_id, slide_object_id, index, poll_id) values ('00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'id.g1', 0, '44444444-4444-4444-4444-444444444444');

-- Viewer (anonymous auth) inserts a response without knowing the org: fill_org trigger + RLS.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.poll_responses(session_id, poll_id, user_id, option_ids) values ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', array['55555555-5555-5555-5555-555555555551'::uuid]);
select public.bump_reaction('33333333-3333-3333-3333-333333333333', 'clap', 3);
select public.bump_reaction('33333333-3333-3333-3333-333333333333', 'clap', 2);
insert into public.questions(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'When is the recording out?');
insert into public.hand_raises(session_id, user_id) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');
-- A viewer must not be able to read another user's responses, approve questions, or insert as someone else.
do $$ begin
  insert into public.poll_responses(session_id, poll_id, user_id, option_ids) values ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '{}');
  raise exception 'RLS should have rejected an insert as another user';
exception when insufficient_privilege then null; end $$;
select 'viewer sees unapproved questions' as check, count(*) = 0 as pass from public.questions where user_id <> auth.uid();
select 'poll_tallies' as check, label, votes from public.poll_tallies where poll_id = '44444444-4444-4444-4444-444444444444' order by index;
reset role;

-- Host membership works; unique-per-user vote enforced; broadcast rows were produced.
select 'is_org_member' as check, public.is_org_member('00000000-0000-0000-0000-000000000001') as pass from (select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false)) x;
select 'reactions batched' as check, count = 5 as pass from public.reactions where kind = 'clap';
select 'broadcasts' as check, event, payload->>'operation' as op from realtime.messages order by id;
do $$ begin
  insert into public.poll_responses(org_id, session_id, poll_id, user_id, option_ids) values ('00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '{}');
  raise exception 'duplicate vote should be rejected';
exception when unique_violation then null; end $$;
