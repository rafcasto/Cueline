-- Chat: a message stream per session, next to Q&A.
--
-- Attendees and hosts post short messages while the doors are open and while the session is
-- live; everyone in the room sees them in order. The host can hide a message (the row stays
-- for the record, the message leaves every screen, and its author is shown it was removed)
-- and can switch chat off for a room. Like every session table, writes reach clients through
-- the session:{id} broadcast trigger; the snapshot takes the latest 200 messages.

alter table public.rooms add column chat_enabled boolean not null default true;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  body text not null check (char_length(body) between 1 and 500),
  -- Host moderation; see check_chat_message() and the select policy below.
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages(session_id, created_at);
create index chat_messages_sender_idx on public.chat_messages(session_id, user_id, created_at desc);

alter table public.chat_messages enable row level security;
create policy "org members all" on public.chat_messages for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
-- A hidden message leaves everyone's snapshot except its author's, who sees it marked removed.
create policy "viewers read chat" on public.chat_messages for select to authenticated
  using (hidden_at is null or user_id = auth.uid());
create policy "viewers chat" on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and hidden_at is null);

-- Before insert: fill org_id from the session, trim the body, and accept the message only
-- from someone in the room (a participant, or a member of the org) while the session is open
-- and the room's chat is on. A sender is held to five messages in any ten seconds.
create or replace function public.check_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  chat_on boolean;
  recent int;
begin
  select * into s from public.sessions where id = new.session_id;
  if s.id is null then raise exception 'session not found'; end if;
  if s.state = 'ended' then raise exception 'the session has ended'; end if;
  select chat_enabled into chat_on from public.rooms where id = s.room_id;
  if not coalesce(chat_on, false) then raise exception 'chat is off'; end if;
  new.org_id := s.org_id;
  new.body := btrim(new.body);
  if not exists (select 1 from public.participants p where p.session_id = new.session_id and p.user_id = new.user_id)
     and not exists (select 1 from public.org_members m where m.org_id = s.org_id and m.user_id = new.user_id) then
    raise exception 'join the room before chatting';
  end if;
  select count(*) into recent from public.chat_messages c
    where c.session_id = new.session_id and c.user_id = new.user_id and c.created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow down'; end if;
  return new;
end;
$$;
create trigger chat_messages_check before insert on public.chat_messages
  for each row execute function public.check_chat_message();
create trigger chat_messages_broadcast after insert or update or delete on public.chat_messages
  for each row execute function public.broadcast_session_change();
