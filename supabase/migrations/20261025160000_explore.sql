-- Explore: a public directory of rooms and upcoming events, the way Meetup lists groups and
-- their events.
--
-- A room is listed when its host turns on the public listing (with a short description and up
-- to six topics); an event is listed when the host marks it public and its room is listed. The
-- directory reads two views that run with the owner's rights, so anonymous visitors see the
-- published rows and the counts (people going, people in the room) without any read access
-- to invites or registrations themselves. A listed event's token is public by design: the
-- event is the registration link, and listing it means wanting it shared.

alter table public.rooms
  add column is_public boolean not null default false,
  add column description text check (description is null or char_length(description) <= 600),
  add column topics text[] not null default '{}' check (coalesce(array_length(topics, 1), 0) <= 6);
alter table public.invites add column is_public boolean not null default false;
create index invites_public_idx on public.invites (starts_at) where is_public and revoked_at is null;
create index rooms_public_idx on public.rooms (name) where is_public;

create view public.public_rooms as
select
  r.id, r.slug, r.name, r.description, r.topics, r.branding, r.created_at,
  (select count(*) from public.invites i where i.room_id = r.id and i.is_public and i.revoked_at is null and i.starts_at >= now() - interval '2 hours') as upcoming_events,
  (select count(*) from public.invites i where i.room_id = r.id and i.is_public and i.revoked_at is null and i.starts_at < now() - interval '2 hours') as past_events,
  (select count(distinct lower(g.email)) from public.registrations g where g.room_id = r.id) as people,
  (select s.state::text from public.sessions s where s.room_id = r.id and s.state <> 'ended' limit 1) as session_state
from public.rooms r
where r.is_public;

create view public.public_events as
select
  i.id, i.token, i.title, i.description, i.starts_at, i.timezone, i.created_at,
  r.id as room_id, r.slug as room_slug, r.name as room_name, r.branding as room_branding, r.topics as room_topics,
  (select count(*) from public.registrations g where g.invite_id = i.id) as going,
  (select s.state::text from public.sessions s where s.room_id = r.id and s.state <> 'ended' limit 1) as session_state
from public.invites i
join public.rooms r on r.id = i.room_id
where i.is_public and i.revoked_at is null and r.is_public and i.starts_at is not null;

grant select on public.public_rooms, public.public_events to anon, authenticated;
