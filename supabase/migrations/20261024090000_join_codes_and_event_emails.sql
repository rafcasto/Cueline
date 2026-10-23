-- Join codes, magic links and the anticipation email sequence.
--
-- Every registration now carries two things an attendee can get in with besides the browser
-- identity they registered on: a short join code (typed together with their email at /join)
-- and an access token (the link in every email, /a/<token>, no typing at all). Both re-bind
-- the registration to whichever anonymous identity the attendee is holding when they use it.
--
-- Every invite (an event) owns an email sequence: a confirmation sent on registration and a
-- set of reminders defined as minutes before the start time. The sequence is seeded with the
-- default copy when the invite is created; the host edits it in the panel. The web app turns
-- it into one scheduled Resend email per registrant per step (registration_emails).

-- Six characters from an alphabet with no look-alikes (no 0/O, 1/I).
create or replace function public.gen_join_code()
returns text language sql volatile as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(gen_random_bytes(1), 0) % 32) + 1, 1), '')
  from generate_series(1, 6);
$$;

alter table public.invites add column timezone text not null default 'UTC';

alter table public.registrations
  add column code text not null default public.gen_join_code(),
  add column access_token text not null unique default public.gen_invite_token();
-- Email + code is the lookup at /join; the pair is unique per invite, the token is unique outright.
create unique index registrations_invite_code_idx on public.registrations(invite_id, code);
create index registrations_email_idx on public.registrations(lower(email));

create type public.invite_email_kind as enum ('confirmation', 'reminder');

create table public.invite_emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  invite_id uuid not null references public.invites(id) on delete cascade,
  kind public.invite_email_kind not null default 'reminder',
  -- Reminders fire this many minutes before invites.starts_at; null for the confirmation.
  minutes_before int check (minutes_before is null or minutes_before > 0),
  subject text not null check (char_length(subject) between 1 and 200),
  -- Plain text with {{name}}, {{title}}, {{starts_at}}, {{link}}, {{code}}, {{room}} placeholders.
  body text not null check (char_length(body) between 1 and 5000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'confirmation') = (minutes_before is null))
);
create index invite_emails_invite_idx on public.invite_emails(invite_id, minutes_before desc nulls first);
-- One confirmation per invite.
create unique index invite_emails_one_confirmation_idx on public.invite_emails(invite_id) where kind = 'confirmation';

create type public.registration_email_status as enum ('queued', 'scheduled', 'sent', 'cancelled', 'failed');

-- One row per (registration, step): what Resend was asked to do and when.
create table public.registration_emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  invite_email_id uuid not null references public.invite_emails(id) on delete cascade,
  send_at timestamptz not null,
  status public.registration_email_status not null default 'queued',
  resend_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, invite_email_id)
);
create index registration_emails_due_idx on public.registration_emails(status, send_at);
create index registration_emails_step_idx on public.registration_emails(invite_email_id);

alter table public.invite_emails enable row level security;
alter table public.registration_emails enable row level security;
create policy "org members all" on public.invite_emails for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "org members read" on public.registration_emails for select to authenticated
  using (public.is_org_member(org_id));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger invite_emails_touch before update on public.invite_emails for each row execute function public.touch_updated_at();
create trigger registration_emails_touch before update on public.registration_emails for each row execute function public.touch_updated_at();

-- Default sequence for every new invite. The host can edit, disable, add or delete steps.
create or replace function public.seed_invite_emails()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.invite_emails (org_id, invite_id, kind, minutes_before, subject, body) values
    (new.org_id, new.id, 'confirmation', null,
     'You''re in: {{title}}',
     E'Hi {{name}},\n\nYou''re registered for {{title}}.\n\nWhen: {{starts_at}}\n\nYour personal link gets you straight in on any device, no password needed:\n{{link}}\n\nIf you ever need to type it instead, go to {{join_url}} and enter your email with the code {{code}}.\n\nSee you there.'),
    (new.org_id, new.id, 'reminder', 2880,
     '{{title}} is in two days',
     E'Hi {{name}},\n\n{{title}} starts in two days, on {{starts_at}}.\n\nBlock the time in your calendar now. Here is your personal link for the day:\n{{link}}\n\nCome with a question. The session is live and we answer them as we go.'),
    (new.org_id, new.id, 'reminder', 1440,
     'Tomorrow: {{title}}',
     E'Hi {{name}},\n\nTomorrow at this time we go live with {{title}}.\n\nStarts: {{starts_at}}\nYour link: {{link}}\n\nNothing to install. Open the link on any device a minute or two early and you will land in the waiting room.'),
    (new.org_id, new.id, 'reminder', 120,
     '{{title}} starts in 2 hours',
     E'Hi {{name}},\n\nTwo hours to go until {{title}}.\n\nYour link: {{link}}\n\nHeadphones help if you are somewhere noisy. The polls and Q&A open the moment we start.'),
    (new.org_id, new.id, 'reminder', 15,
     'Starting in 15 minutes: {{title}}',
     E'Hi {{name}},\n\nWe open the doors in 15 minutes.\n\nJoin here: {{link}}\n\nSee you inside.');
  return new;
end;
$$;
create trigger invites_seed_emails after insert on public.invites for each row execute function public.seed_invite_emails();
