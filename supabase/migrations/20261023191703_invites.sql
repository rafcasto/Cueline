-- Invite links and registration.
-- The organiser creates an invite for a room; attendees open /join/<token>, register with a
-- name and email, and only then can enter /r/<slug>. The token is the only thing an attendee
-- holds, so invites are never readable in bulk by viewers: the join page resolves a token
-- server-side and registrations are written by /api/register with the service key.

-- URL-safe random token (16 bytes -> 22 chars, no padding).
create or replace function public.gen_invite_token()
returns text language sql volatile as $$
  select rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  token text not null unique default public.gen_invite_token(),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  starts_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index invites_room_idx on public.invites(room_id, created_at desc);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  invite_id uuid not null references public.invites(id) on delete cascade,
  -- The attendee's (anonymous) auth identity, so the room can recognise them on return.
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  unique (invite_id, email)
);
create index registrations_room_user_idx on public.registrations(room_id, user_id);
create index registrations_invite_idx on public.registrations(invite_id, created_at desc);

alter table public.invites enable row level security;
alter table public.registrations enable row level security;

create policy "org members all" on public.invites for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "org members all" on public.registrations for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
-- An attendee sees only their own registration; nobody but org members sees invites or other attendees.
create policy "attendees read own registration" on public.registrations
  for select to authenticated using (user_id = auth.uid());
