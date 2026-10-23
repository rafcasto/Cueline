-- Rooms own the email sequence; events inherit it. Hosts create rooms themselves.
--
-- A host runs any number of rooms, and each room carries its own deck, activities, waiting
-- room and, from here on, its own email sequence: the welcome sent on registration and the
-- reminders defined as minutes before the start (48 h, 24 h, 2 h and 15 min by default).
--
-- The sequence is configured once per room (room_emails). Every event (invite) created in the
-- room copies it into invite_emails, each row linked back to its room step through
-- room_email_id, so the actual send times are counted back from that event's start. When the
-- host edits a room step, sync_room_email() pushes the change to the inherited rows of every
-- active event and the web app reschedules them at Resend.

-- ---------------------------------------------------------------------------
-- Rooms: hosts create them from the panel, so the slug and name are validated here.
-- ---------------------------------------------------------------------------
alter table public.rooms
  add constraint rooms_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add constraint rooms_name_length check (char_length(name) between 1 and 80);

-- ---------------------------------------------------------------------------
-- The room's sequence
-- ---------------------------------------------------------------------------
create table public.room_emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  kind public.invite_email_kind not null default 'reminder',
  -- Reminders fire this many minutes before the event's starts_at; null for the welcome.
  minutes_before int check (minutes_before is null or minutes_before > 0),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'confirmation') = (minutes_before is null))
);
create index room_emails_room_idx on public.room_emails(room_id, minutes_before desc nulls first);
-- One welcome per room.
create unique index room_emails_one_confirmation_idx on public.room_emails(room_id) where kind = 'confirmation';

alter table public.room_emails enable row level security;
create policy "org members all" on public.room_emails for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create trigger room_emails_touch before update on public.room_emails for each row execute function public.touch_updated_at();

-- An event step remembers which room step it came from. Deleting the room step removes the
-- inherited copies (the web app cancels their scheduled emails first).
alter table public.invite_emails add column room_email_id uuid references public.room_emails(id) on delete cascade;
create unique index invite_emails_room_step_idx on public.invite_emails(invite_id, room_email_id) where room_email_id is not null;

-- ---------------------------------------------------------------------------
-- Defaults: welcome on registration, then 48 h, 24 h, 2 h and 15 min before the start.
-- ---------------------------------------------------------------------------
create or replace function public.default_room_emails(p_org uuid, p_room uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.room_emails (org_id, room_id, kind, minutes_before, subject, body) values
    (p_org, p_room, 'confirmation', null,
     'Welcome to {{title}}',
     E'Hi {{first_name}},\n\nWelcome aboard. You''re registered for {{title}}.\n\nWhen: {{starts_at}}\n\nYour personal link gets you straight in on any device, no password needed:\n{{link}}\n\nIf you ever need to type it instead, go to {{join_url}} and enter your email with the code {{code}}.\n\nWe''ll send a few reminders as the day gets closer. See you there.'),
    (p_org, p_room, 'reminder', 2880,
     '{{title}} is in two days',
     E'Hi {{first_name}},\n\n{{title}} starts in two days, on {{starts_at}}.\n\nBlock the time in your calendar now. Here is your personal link for the day:\n{{link}}\n\nCome with a question. The session is live and we answer them as we go.'),
    (p_org, p_room, 'reminder', 1440,
     'Tomorrow: {{title}}',
     E'Hi {{first_name}},\n\nTomorrow at this time we go live with {{title}}.\n\nStarts: {{starts_at}}\nYour link: {{link}}\n\nNothing to install. Open the link on any device a minute or two early and you will land in the waiting room.'),
    (p_org, p_room, 'reminder', 120,
     '{{title}} starts in 2 hours',
     E'Hi {{first_name}},\n\nTwo hours to go until {{title}}.\n\nYour link: {{link}}\n\nHeadphones help if you are somewhere noisy. The polls and Q&A open the moment we start.'),
    (p_org, p_room, 'reminder', 15,
     'Starting in 15 minutes: {{title}}',
     E'Hi {{first_name}},\n\nWe open the doors in 15 minutes.\n\nJoin here: {{link}}\n\nSee you inside.');
$$;
revoke execute on function public.default_room_emails(uuid, uuid) from public, anon, authenticated;

create or replace function public.seed_room_emails()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.default_room_emails(new.org_id, new.id);
  return new;
end;
$$;
create trigger rooms_seed_emails after insert on public.rooms for each row execute function public.seed_room_emails();

-- A new event copies the room's sequence (replaces the hard-coded defaults of the previous migration).
create or replace function public.seed_invite_emails()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.invite_emails (org_id, invite_id, room_email_id, kind, minutes_before, subject, body, enabled)
  select r.org_id, new.id, r.id, r.kind, r.minutes_before, r.subject, r.body, r.enabled
  from public.room_emails r
  where r.room_id = new.room_id;
  return new;
end;
$$;

-- Push one room step to every active (not revoked) event in its room: insert where the event
-- has no copy yet, update the copy where it has. Returns the event steps touched so the caller
-- can reschedule them at Resend. Service role only; the web app calls it after a host edit.
create or replace function public.sync_room_email(p_step uuid)
returns table (invite_email_id uuid) language plpgsql security definer set search_path = public as $$
begin
  return query
  insert into public.invite_emails (org_id, invite_id, room_email_id, kind, minutes_before, subject, body, enabled)
  select r.org_id, i.id, r.id, r.kind, r.minutes_before, r.subject, r.body, r.enabled
  from public.room_emails r
  join public.invites i on i.room_id = r.room_id and i.revoked_at is null
  where r.id = p_step
  on conflict (invite_id, room_email_id) where room_email_id is not null
  do update set minutes_before = excluded.minutes_before, subject = excluded.subject, body = excluded.body, enabled = excluded.enabled
  returning public.invite_emails.id;
end;
$$;
revoke execute on function public.sync_room_email(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: every existing room gets a sequence. Where the room has an open event, its steps
-- become the room's (so a host's edits survive); otherwise the defaults. Then each existing
-- event step is linked to the room step it matches, so later room edits reach it.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  src uuid;
begin
  for r in select id, org_id from public.rooms loop
    select i.id into src from public.invites i
      where i.room_id = r.id and i.revoked_at is null and exists (select 1 from public.invite_emails e where e.invite_id = i.id)
      order by i.created_at desc limit 1;
    if src is not null then
      insert into public.room_emails (org_id, room_id, kind, minutes_before, subject, body, enabled)
      select e.org_id, r.id, e.kind, e.minutes_before, e.subject, e.body, e.enabled
      from public.invite_emails e where e.invite_id = src;
    else
      perform public.default_room_emails(r.org_id, r.id);
    end if;
  end loop;
end $$;

with ranked_event_steps as (
  select e.id, i.room_id, e.kind, e.minutes_before,
         row_number() over (partition by e.invite_id, e.kind, e.minutes_before order by e.created_at) as rn
  from public.invite_emails e
  join public.invites i on i.id = e.invite_id
  where e.room_email_id is null
),
ranked_room_steps as (
  select s.id, s.room_id, s.kind, s.minutes_before,
         row_number() over (partition by s.room_id, s.kind, s.minutes_before order by s.created_at) as rn
  from public.room_emails s
)
update public.invite_emails e
set room_email_id = rr.id
from ranked_event_steps re
join ranked_room_steps rr
  on rr.room_id = re.room_id and rr.kind = re.kind and rr.minutes_before is not distinct from re.minutes_before and rr.rn = re.rn
where e.id = re.id;
