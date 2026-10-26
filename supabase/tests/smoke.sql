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
select 'stage layout defaults to the corner' as check, layout = '{"mode":"default"}'::jsonb as pass from public.sessions where id = '33333333-3333-3333-3333-333333333333';
update public.sessions set layout = '{"mode":"custom","video":{"x":10,"y":10,"w":30}}'::jsonb where id = '33333333-3333-3333-3333-333333333333';
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

-- Invite links and registration. Host creates an invite; the attendee's registration is written
-- by /api/register (service key) and is readable only by that attendee and org members.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.invites(id, org_id, room_id, title, created_by) values
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Launch webinar', '11111111-1111-1111-1111-111111111111');
select 'invite token is url-safe' as check, token ~ '^[A-Za-z0-9_-]{22}$' as pass from public.invites where id = '66666666-6666-6666-6666-666666666666';
reset role;
set role service_role;
insert into public.registrations(org_id, room_id, invite_id, user_id, name, email) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Ada', 'ada@example.com'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', 'Bob', 'bob@example.com');
do $$ begin
  insert into public.registrations(org_id, room_id, invite_id, user_id, name, email) values
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888', 'Ada again', 'ada@example.com');
  raise exception 'duplicate email on one invite should be rejected';
exception when unique_violation then null; end $$;
do $$ begin
  insert into public.registrations(org_id, room_id, invite_id, user_id, name, email) values
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888', 'No email', 'not-an-email');
  raise exception 'malformed email should be rejected';
exception when check_violation then null; end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select 'attendee sees only own registration' as check, count(*) = 1 and bool_and(user_id = auth.uid()) as pass from public.registrations;
select 'attendee cannot list invites' as check, count(*) = 0 as pass from public.invites;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select 'host sees all registrations' as check, count(*) = 2 as pass from public.registrations where invite_id = '66666666-6666-6666-6666-666666666666';
reset role;

-- Join codes, magic links and the seeded email sequence.
select 'join code is six safe chars' as check, bool_and(code ~ '^[23456789A-HJ-NP-Z]{6}$') as pass from public.registrations;
select 'access token per registration' as check, count(distinct access_token) = count(*) as pass from public.registrations;
select 'invite seeds the default sequence' as check,
  count(*) = 6 and bool_and(enabled) and count(*) filter (where kind = 'confirmation') = 1 and count(*) filter (where kind = 'waitlist') = 1 as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666';
select 'reminder offsets' as check, array_agg(minutes_before order by minutes_before desc) = '{2880,1440,120,15}'::int[] as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666' and kind = 'reminder';
do $$ begin
  insert into public.invite_emails(org_id, invite_id, kind, minutes_before, subject, body)
  values ('00000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'confirmation', 5, 'x', 'y');
  raise exception 'confirmation with an offset should be rejected';
exception when check_violation then null; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select 'attendee cannot read the sequence' as check, count(*) = 0 as pass from public.invite_emails;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.invite_emails set enabled = false where invite_id = '66666666-6666-6666-6666-666666666666' and minutes_before = 15;
select 'host edits the sequence' as check, bool_or(not enabled) and bool_and(updated_at >= created_at) as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666';
reset role;

-- Room-level sequences: a room seeds one, events inherit it, room edits reach active events,
-- and hosts create rooms themselves (each with its own sequence).
select 'room seeds the default sequence' as check,
  count(*) = 6 and count(*) filter (where kind = 'confirmation') = 1 and count(*) filter (where kind = 'waitlist') = 1 and bool_and(enabled) as pass
  from public.room_emails where room_id = '00000000-0000-0000-0000-000000000002';
select 'event inherits the room sequence' as check,
  count(*) = 6 and bool_and(room_email_id is not null) as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.room_emails set subject = 'Two days to go: {{title}}', minutes_before = 2900
  where room_id = '00000000-0000-0000-0000-000000000002' and minutes_before = 2880;
insert into public.room_emails(org_id, room_id, minutes_before, subject, body)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 60, 'One hour: {{title}}', 'Nearly there: {{link}}');
insert into public.rooms(id, org_id, slug, name)
  values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'second-room', 'Second room');
do $$ begin
  insert into public.rooms(org_id, slug, name) values ('00000000-0000-0000-0000-000000000001', 'Bad Slug!', 'Bad');
  raise exception 'a slug with spaces or capitals should be rejected';
exception when check_violation then null; end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select 'attendee cannot read room sequences' as check, count(*) = 0 as pass from public.room_emails;
do $$ begin
  perform public.sync_room_email('00000000-0000-0000-0000-000000000002');
  raise exception 'an attendee should not be able to sync room emails';
exception when insufficient_privilege then null; end $$;
reset role;
select 'host creates a room with its own sequence' as check, count(*) = 6 as pass
  from public.room_emails where room_id = '00000000-0000-0000-0000-000000000003';
set role service_role;
select 'sync updates the inherited step' as check, count(*) = 1 as pass
  from public.sync_room_email((select id from public.room_emails where room_id = '00000000-0000-0000-0000-000000000002' and minutes_before = 2900));
select 'inherited step follows the room step' as check, subject = 'Two days to go: {{title}}' and minutes_before = 2900 as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666'
   and room_email_id = (select id from public.room_emails where room_id = '00000000-0000-0000-0000-000000000002' and minutes_before = 2900);
select 'sync adds a new room step to the event' as check, count(*) = 1 as pass
  from public.sync_room_email((select id from public.room_emails where room_id = '00000000-0000-0000-0000-000000000002' and minutes_before = 60));
select 'event carries the added step' as check, count(*) = 7 as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666';
update public.invites set revoked_at = now() where id = '66666666-6666-6666-6666-666666666666';
select 'sync skips revoked events' as check, count(*) = 0 as pass
  from public.sync_room_email((select id from public.room_emails where room_id = '00000000-0000-0000-0000-000000000002' and minutes_before = 60));
update public.invites set revoked_at = null where id = '66666666-6666-6666-6666-666666666666';
delete from public.room_emails where room_id = '00000000-0000-0000-0000-000000000002' and minutes_before = 60;
select 'deleting a room step removes the inherited copy' as check, count(*) = 6 as pass
  from public.invite_emails where invite_id = '66666666-6666-6666-6666-666666666666';
reset role;

-- Chat: attendees and hosts post, the body is trimmed and the org filled, hidden messages leave
-- everyone's view but the author's, a sender is rate-limited, and the room switch turns chat off.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '  Hello from Ada  ');
select 'chat fills org and trims' as check, org_id = '00000000-0000-0000-0000-000000000001' and body = 'Hello from Ada' as pass from public.chat_messages where user_id = auth.uid();
do $$ begin
  insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'spoof');
  raise exception 'RLS should have rejected a chat message as another user';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '   ');
  raise exception 'a blank message should be rejected';
exception when check_violation then null; end $$;
insert into public.chat_messages(session_id, user_id, body)
  select '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'msg ' || g from generate_series(1, 4) g;
do $$ begin
  insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'one too many');
  raise exception 'a sixth message in ten seconds should be rejected';
exception when raise_exception then if sqlerrm <> 'slow down' then raise; end if; end $$;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
do $$ begin
  insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'not seated');
  raise exception 'someone without a seat should not chat';
exception when raise_exception then if sqlerrm <> 'join the room before chatting' then raise; end if; end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Welcome everyone');
select 'host chats without a seat' as check, count(*) = 1 as pass from public.chat_messages where user_id = auth.uid();
update public.chat_messages set hidden_at = now() where body = 'msg 1';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select 'author still sees own hidden message' as check, count(*) = 1 as pass from public.chat_messages where hidden_at is not null;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
select 'others never see a hidden message' as check, count(*) = 5 and bool_and(hidden_at is null) as pass from public.chat_messages;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.rooms set chat_enabled = false where id = '00000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  insert into public.chat_messages(session_id, user_id, body) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'anyone there?');
  raise exception 'chat should be off for the room';
exception when raise_exception then if sqlerrm <> 'chat is off' then raise; end if; end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.rooms set chat_enabled = true where id = '00000000-0000-0000-0000-000000000002';
reset role;
select 'chat broadcasts' as check, count(*) = 7 as pass from realtime.messages where event = 'chat_messages';

-- Billing: the platform setting exists, passes are readable by the org, sessions carry the plan's grant.
reset role;
select 'stripe mode defaults to the sandbox' as check, value = '"test"'::jsonb as pass from public.app_settings where key = 'stripe_mode';
insert into public.event_passes(id, org_id, stripe_mode, stripe_session_id, status) values ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000001', 'test', 'cs_test_smoke', 'paid');
update public.sessions set counted = true, max_participants = 10, ends_by = started_at + interval '20 minutes', event_pass_id = '66666666-6666-6666-6666-666666666666' where id = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select 'org member reads the pass' as check, count(*) = 1 as pass from public.event_passes where id = '66666666-6666-6666-6666-666666666666';
select 'app_settings is service-role only' as check, count(*) = 0 as pass from public.app_settings;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select 'attendee cannot read passes' as check, count(*) = 0 as pass from public.event_passes;
reset role;

-- Explore: listed rooms and public events are readable anonymously through the views; nothing else leaks.
reset role;
insert into public.invites(id, org_id, room_id, title, starts_at, is_public) values
  ('77777777-7777-7777-7777-777777777771', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Public talk', now() + interval '1 day', true),
  ('77777777-7777-7777-7777-777777777772', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Private talk', now() + interval '1 day', false);
set role anon;
select 'unlisted room hides its public event' as check, count(*) = 0 as pass from public.public_events;
reset role;
update public.rooms set is_public = true, description = 'Weekly product talks', topics = '{product,startups}' where id = '00000000-0000-0000-0000-000000000002';
set role anon;
select 'anon sees the listed room with its topics' as check, count(*) = 1 and bool_and('product' = any(topics)) as pass from public.public_rooms where slug = 'main';
select 'anon sees only the public event, with its token' as check, count(*) = 1 and bool_and(title = 'Public talk' and token <> '') as pass from public.public_events;
select 'anon cannot read invites directly' as check, count(*) = 0 as pass from public.invites;
select 'anon cannot read registrations' as check, count(*) = 0 as pass from public.registrations;
reset role;

-- Seats, the waiting list and opting out. Seating happens in register_attendee() under a lock on
-- the invite; promote_waitlist() refills seats; the directory counts seats, not rows.
reset role;
insert into public.invites(id, org_id, room_id, title, starts_at, capacity) values
  ('99999999-9999-9999-9999-999999999991', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Small workshop', now() + interval '2 days', 2);
select 'every reminder asks people to free their seat' as check, bool_and(body like '%{{cancel_url}}%') as pass
  from public.invite_emails where invite_id = '99999999-9999-9999-9999-999999999991' and kind in ('reminder', 'confirmation') and minutes_before is distinct from 15;
set role service_role;
select 'first two registrants are seated' as check, bool_and(waitlisted_at is null) and count(*) = 2 as pass from (
  select * from public.register_attendee('99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Ada', 'ada@example.com', 2)
  union all
  select * from public.register_attendee('99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Bob', 'bob@example.com', 2)) x;
select 'third registrant is waitlisted' as check, waitlisted_at is not null as pass
  from public.register_attendee('99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Cy', 'cy@example.com', 2);
select 'coming back re-binds the row without a second seat' as check, user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9' and waitlisted_at is null as pass
  from public.register_attendee('99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9', 'Ada L', 'ADA@example.com', 2);
select 'unlimited capacity never waitlists' as check, waitlisted_at is null as pass
  from public.register_attendee('99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Dee', 'dee@example.com', null);
update public.registrations set cancelled_at = now() where invite_id = '99999999-9999-9999-9999-999999999991' and email = 'dee@example.com';
update public.registrations set cancelled_at = now() where invite_id = '99999999-9999-9999-9999-999999999991' and email = 'ada@example.com';
select 'a freed seat goes to the first in line' as check, count(*) = 1 and bool_and(registration_id = (select id from public.registrations where email = 'cy@example.com')) as pass
  from public.promote_waitlist('99999999-9999-9999-9999-999999999991', 2);
select 'nobody else is promoted past the capacity' as check, count(*) = 0 as pass from public.promote_waitlist('99999999-9999-9999-9999-999999999991', 2);
select 'opting out then registering again rejoins the queue' as check, cancelled_at is null and waitlisted_at is not null as pass
  from public.register_attendee('99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Ada', 'ada@example.com', 2);
reset role;
update public.invites set is_public = true where id = '99999999-9999-9999-9999-999999999991';
set role anon;
select 'the directory counts seats and the waiting list' as check, going = 2 and waiting = 1 and capacity = 2 as pass from public.public_events where id = '99999999-9999-9999-9999-999999999991';
reset role;
do $$ begin
  insert into public.room_emails(org_id, room_id, kind, minutes_before, subject, body) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'waitlist', 5, 'x', 'y');
  raise exception 'a waitlist step with an offset should be rejected';
exception when check_violation then null; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  perform public.register_attendee('99999999-9999-9999-9999-999999999991', '22222222-2222-2222-2222-222222222222', 'Eve', 'eve@example.com', 2);
  raise exception 'an attendee should not call register_attendee directly';
exception when insufficient_privilege then null; end $$;
reset role;

-- The plan belongs to the room: new rooms start free, the seeded one is complimentary Pro, the
-- subscription table is for the webhook and org members only.
select 'rooms start free' as check, plan = 'free' and plan_status = 'active' and not complimentary as pass from public.rooms where id = '00000000-0000-0000-0000-000000000003';
select 'the seeded room is complimentary pro' as check, plan = 'pro' and complimentary as pass from public.rooms where id = '00000000-0000-0000-0000-000000000002';
select 'organisations no longer carry a plan' as check, count(*) = 0 as pass from information_schema.columns where table_schema = 'public' and table_name = 'organisations' and column_name in ('plan', 'plan_status', 'stripe_subscription_id');
set role service_role;
insert into public.room_subscriptions(room_id, org_id, stripe_mode, stripe_subscription_id, price_lookup) values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'test', 'sub_smoke', 'starter_monthly');
update public.rooms set plan = 'starter' where id = '00000000-0000-0000-0000-000000000003';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select 'org member reads the room subscription' as check, count(*) = 1 as pass from public.room_subscriptions;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select 'attendee cannot read room subscriptions' as check, count(*) = 0 as pass from public.room_subscriptions;
select 'attendee sees the room plan but no subscription' as check, plan = 'starter' as pass from public.rooms where id = '00000000-0000-0000-0000-000000000003';
reset role;
