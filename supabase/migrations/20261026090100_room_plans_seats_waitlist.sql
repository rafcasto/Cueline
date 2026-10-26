-- The plan belongs to the room; seats per event, a waiting list, and opting out.
--
-- Plans. A room is either the organisation's single free room or a paid one: Starter and Pro
-- are bought per room, and every room after the first is a purchase. The plan therefore moves
-- from organisations to rooms (plan, plan_status) and the Stripe subscription behind it goes in
-- room_subscriptions, a table attendees cannot read (rooms themselves are public). The
-- organisation keeps the Stripe customer. A room without a paid plan is free while it is the
-- organisation's only room and locked otherwise (apps/web/src/lib/billing.ts, roomAccess), so a
-- free room never sits next to a paid one, through cancellation included. Rooms created by a
-- platform admin are complimentary: Pro limits, no subscription, never locked.
--
-- Seats. An event (invite) carries a capacity: how many registrants get a seat, chosen by the
-- host up to the room's participants-per-session. Registrations beyond it join a waiting list
-- (waitlisted_at) in order of arrival. A registrant can opt out (cancelled_at), which frees the
-- seat; the earliest person on the waiting list is moved into it. Seating is decided in
-- register_attendee() under a lock on the invite, so two people cannot both take the last
-- seat; promote_waitlist() refills seats after a cancellation or a capacity change. Both take
-- the effective capacity from the caller, because the plan's cap is application config.
--
-- Emails. Every sequence gets a 'waitlist' step (sent on registration instead of the welcome
-- when the registrant is waitlisted; the welcome goes out when a seat opens), and every step
-- can carry {{cancel_url}}, the registrant's opt-out link. The reminder copy now asks people
-- who are not coming to free their seat.

-- ---------------------------------------------------------------------------
-- The plan, per room
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column plan public.plan not null default 'free',
  add column plan_status public.plan_status not null default 'active',
  -- Created by a platform admin: runs at Pro, needs no subscription, is never locked.
  add column complimentary boolean not null default false;

-- Service-role writes (the Stripe webhook); org members may read their own.
create table public.room_subscriptions (
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
create unique index room_subscriptions_stripe_idx on public.room_subscriptions (stripe_mode, stripe_subscription_id) where stripe_subscription_id is not null;
create index room_subscriptions_org_idx on public.room_subscriptions (org_id);
alter table public.room_subscriptions enable row level security;
create policy "members read room subscriptions" on public.room_subscriptions for select to authenticated using (public.is_org_member(org_id));
create trigger room_subscriptions_touch before update on public.room_subscriptions for each row execute function public.touch_updated_at();

-- Sessions are now counted per room per billing period.
create index sessions_room_started_idx on public.sessions (room_id, started_at) where counted;

-- The organisation's plan columns go. Nothing is carried over: there were no paid organisations
-- when this landed, and the seeded room is complimentary (seed.sql).
drop index if exists public.organisations_stripe_subscription_idx;
alter table public.organisations
  drop column plan,
  drop column plan_status,
  drop column plan_price_lookup,
  drop column plan_period_start,
  drop column plan_period_end,
  drop column stripe_subscription_id;

-- ---------------------------------------------------------------------------
-- Seats and the waiting list
-- ---------------------------------------------------------------------------
-- Null means "the plan's maximum"; the application clamps any value to the plan's cap.
alter table public.invites add column capacity int check (capacity is null or capacity between 1 and 10000);

alter table public.registrations
  add column waitlisted_at timestamptz,
  add column cancelled_at timestamptz;
create index registrations_seated_idx on public.registrations (invite_id, created_at) where waitlisted_at is null and cancelled_at is null;
create index registrations_waitlist_idx on public.registrations (invite_id, waitlisted_at) where waitlisted_at is not null and cancelled_at is null;

-- Register, re-register or come back: one row per (invite, email). A new registrant gets a seat
-- while seats remain and the waiting list otherwise; a returning one re-binds the row to the
-- identity they are holding now; someone who opted out is revived and seated or waitlisted like
-- a newcomer. p_capacity null means unlimited. Returns the row as it now stands.
create or replace function public.register_attendee(p_invite uuid, p_user uuid, p_name text, p_email text, p_capacity int)
returns setof public.registrations language plpgsql security definer set search_path = public as $$
declare
  i public.invites%rowtype;
  r public.registrations%rowtype;
  seated int;
  no_seats boolean;
begin
  select * into i from public.invites where id = p_invite for update;
  if i.id is null then raise exception 'invite not found'; end if;
  select count(*) into seated from public.registrations g
   where g.invite_id = p_invite and g.waitlisted_at is null and g.cancelled_at is null;
  no_seats := p_capacity is not null and seated >= p_capacity;
  select * into r from public.registrations g where g.invite_id = p_invite and lower(g.email) = lower(p_email);
  if r.id is null then
    insert into public.registrations (org_id, room_id, invite_id, user_id, name, email, waitlisted_at)
    values (i.org_id, i.room_id, p_invite, p_user, p_name, lower(p_email), case when no_seats then now() else null end)
    returning * into r;
  elsif r.cancelled_at is not null then
    update public.registrations
       set user_id = p_user, name = p_name, cancelled_at = null, waitlisted_at = case when no_seats then now() else null end
     where id = r.id returning * into r;
  else
    update public.registrations set user_id = p_user, name = p_name where id = r.id returning * into r;
  end if;
  return next r;
end;
$$;
revoke execute on function public.register_attendee(uuid, uuid, text, text, int) from public, anon, authenticated;

-- Fill free seats from the waiting list, earliest first. Returns the registrations promoted so
-- the application can send them the welcome and schedule their reminders.
create or replace function public.promote_waitlist(p_invite uuid, p_capacity int)
returns table (registration_id uuid) language plpgsql security definer set search_path = public as $$
declare
  seated int;
  v_id uuid;
begin
  perform 1 from public.invites where id = p_invite for update;
  select count(*) into seated from public.registrations g
   where g.invite_id = p_invite and g.waitlisted_at is null and g.cancelled_at is null;
  loop
    exit when p_capacity is not null and seated >= p_capacity;
    select id into v_id from public.registrations g
     where g.invite_id = p_invite and g.waitlisted_at is not null and g.cancelled_at is null
     order by g.waitlisted_at, g.created_at limit 1;
    exit when v_id is null;
    update public.registrations set waitlisted_at = null where id = v_id;
    seated := seated + 1;
    registration_id := v_id;
    return next;
  end loop;
end;
$$;
revoke execute on function public.promote_waitlist(uuid, int) from public, anon, authenticated;

-- The directory counts seats, not rows: people who opted out are gone and the waiting list is
-- shown as such. Columns are added at the end so the view can be replaced in place.
create or replace view public.public_rooms as
select
  r.id, r.slug, r.name, r.description, r.topics, r.branding, r.created_at,
  (select count(*) from public.invites i where i.room_id = r.id and i.is_public and i.revoked_at is null and i.starts_at >= now() - interval '2 hours') as upcoming_events,
  (select count(*) from public.invites i where i.room_id = r.id and i.is_public and i.revoked_at is null and i.starts_at < now() - interval '2 hours') as past_events,
  (select count(distinct lower(g.email)) from public.registrations g where g.room_id = r.id and g.cancelled_at is null) as people,
  (select s.state::text from public.sessions s where s.room_id = r.id and s.state <> 'ended' limit 1) as session_state
from public.rooms r
where r.is_public;

create or replace view public.public_events as
select
  i.id, i.token, i.title, i.description, i.starts_at, i.timezone, i.created_at,
  r.id as room_id, r.slug as room_slug, r.name as room_name, r.branding as room_branding, r.topics as room_topics,
  (select count(*) from public.registrations g where g.invite_id = i.id and g.waitlisted_at is null and g.cancelled_at is null) as going,
  (select s.state::text from public.sessions s where s.room_id = r.id and s.state <> 'ended' limit 1) as session_state,
  (select count(*) from public.registrations g where g.invite_id = i.id and g.waitlisted_at is not null and g.cancelled_at is null) as waiting,
  i.capacity
from public.invites i
join public.rooms r on r.id = i.room_id
where i.is_public and i.revoked_at is null and r.is_public and i.starts_at is not null;

-- ---------------------------------------------------------------------------
-- Email sequence: the waiting-list step and the opt-out link
-- ---------------------------------------------------------------------------
-- The welcome and the waiting-list note both go out on registration, so neither has an offset.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c' and conrelid in ('public.room_emails'::regclass, 'public.invite_emails'::regclass)
      and pg_get_constraintdef(oid) like '%confirmation%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table public.room_emails add constraint room_emails_offset_by_kind check ((kind in ('confirmation', 'waitlist')) = (minutes_before is null));
alter table public.invite_emails add constraint invite_emails_offset_by_kind check ((kind in ('confirmation', 'waitlist')) = (minutes_before is null));
create unique index room_emails_one_waitlist_idx on public.room_emails(room_id) where kind = 'waitlist';
create unique index invite_emails_one_waitlist_idx on public.invite_emails(invite_id) where kind = 'waitlist';

create or replace function public.default_waitlist_email(p_org uuid, p_room uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.room_emails (org_id, room_id, kind, minutes_before, subject, body) values
    (p_org, p_room, 'waitlist', null,
     'You''re on the waiting list for {{title}}',
     E'Hi {{first_name}},\n\n{{title}} is full, so we''ve put you on the waiting list.\n\nWhen: {{starts_at}}\n\nIf a seat frees up you''ll get an email with your personal link, and you can check your place any time here:\n{{link}}\n\nPlans changed? Let us know and we''ll skip you: {{cancel_url}}');
$$;
revoke execute on function public.default_waitlist_email(uuid, uuid) from public, anon, authenticated;

-- New rooms: the welcome, the waiting-list note, and the reminders, which now ask people who
-- are not coming to free their seat.
create or replace function public.default_room_emails(p_org uuid, p_room uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.room_emails (org_id, room_id, kind, minutes_before, subject, body) values
    (p_org, p_room, 'confirmation', null,
     'Welcome to {{title}}',
     E'Hi {{first_name}},\n\nWelcome aboard. You''re registered for {{title}}.\n\nWhen: {{starts_at}}\n\nYour personal link gets you straight in on any device, no password needed:\n{{link}}\n\nIf you ever need to type it instead, go to {{join_url}} and enter your email with the code {{code}}.\n\nCan''t make it after all? Free your seat for someone on the waiting list: {{cancel_url}}\n\nSee you there.'),
    (p_org, p_room, 'reminder', 2880,
     '{{title}} is in two days',
     E'Hi {{first_name}},\n\n{{title}} starts in two days, on {{starts_at}}.\n\nBlock the time in your calendar now. Here is your personal link for the day:\n{{link}}\n\nCome with a question. The session is live and we answer them as we go.\n\nNot coming? Free your seat so someone on the waiting list can have it: {{cancel_url}}'),
    (p_org, p_room, 'reminder', 1440,
     'Tomorrow: {{title}}',
     E'Hi {{first_name}},\n\nTomorrow at this time we go live with {{title}}.\n\nStarts: {{starts_at}}\nYour link: {{link}}\n\nNothing to install. Open the link on any device a minute or two early and you will land in the waiting room.\n\nNot coming? Free your seat so someone on the waiting list can have it: {{cancel_url}}'),
    (p_org, p_room, 'reminder', 120,
     '{{title}} starts in 2 hours',
     E'Hi {{first_name}},\n\nTwo hours to go until {{title}}.\n\nYour link: {{link}}\n\nHeadphones help if you are somewhere noisy. The polls and Q&A open the moment we start.\n\nCan''t make it? Free your seat: {{cancel_url}}'),
    (p_org, p_room, 'reminder', 15,
     'Starting in 15 minutes: {{title}}',
     E'Hi {{first_name}},\n\nWe open the doors in 15 minutes.\n\nJoin here: {{link}}\n\nSee you inside.');
  select public.default_waitlist_email(p_org, p_room);
$$;

-- Existing rooms: add the waiting-list step and push it to their open events; ask people to free
-- their seat in every reminder that does not already say so.
insert into public.room_emails (org_id, room_id, kind, minutes_before, subject, body)
select r.org_id, r.id, 'waitlist', null,
       'You''re on the waiting list for {{title}}',
       E'Hi {{first_name}},\n\n{{title}} is full, so we''ve put you on the waiting list.\n\nWhen: {{starts_at}}\n\nIf a seat frees up you''ll get an email with your personal link, and you can check your place any time here:\n{{link}}\n\nPlans changed? Let us know and we''ll skip you: {{cancel_url}}'
from public.rooms r
where not exists (select 1 from public.room_emails e where e.room_id = r.id and e.kind = 'waitlist');

update public.room_emails
   set body = body || E'\n\nNot coming? Free your seat so someone on the waiting list can have it: {{cancel_url}}'
 where kind = 'reminder' and minutes_before >= 60 and body not like '%{{cancel_url}}%';
update public.room_emails
   set body = body || E'\n\nCan''t make it after all? Free your seat for someone on the waiting list: {{cancel_url}}'
 where kind = 'confirmation' and body not like '%{{cancel_url}}%';

insert into public.invite_emails (org_id, invite_id, room_email_id, kind, minutes_before, subject, body, enabled)
select r.org_id, i.id, r.id, r.kind, r.minutes_before, r.subject, r.body, r.enabled
from public.invites i
join public.room_emails r on r.room_id = i.room_id and r.kind = 'waitlist'
where i.revoked_at is null
  and not exists (select 1 from public.invite_emails e where e.invite_id = i.id and e.kind = 'waitlist');

update public.invite_emails e
   set body = r.body
  from public.room_emails r
 where e.room_email_id = r.id and e.kind in ('reminder', 'confirmation') and e.body not like '%{{cancel_url}}%' and r.body like '%{{cancel_url}}%';
