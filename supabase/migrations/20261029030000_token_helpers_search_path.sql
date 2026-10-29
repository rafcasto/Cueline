-- Fix: registering through an invite link failed on the hosted project.
--
-- gen_invite_token() and gen_join_code() call gen_random_bytes() from pgcrypto. On hosted
-- Supabase that extension lives in the `extensions` schema, which is on the default
-- search_path but not on the one register_attendee() pins (`set search_path = public`, as every
-- security definer function here does). So the defaults for registrations.code and
-- registrations.access_token raised "function gen_random_bytes(integer) does not exist" from
-- inside register_attendee(), and /api/register answered with an internal error. Inserting an
-- invite from the API never hit it because that runs on the connection's default path.
--
-- Both helpers now carry their own search_path, so they find pgcrypto wherever it is
-- installed (`extensions` on Supabase, `public` on a plain Postgres) whoever calls them.
create or replace function public.gen_invite_token()
returns text language sql volatile set search_path = public, extensions as $$
  select rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

create or replace function public.gen_join_code()
returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(gen_random_bytes(1), 0) % 32) + 1, 1), '')
  from generate_series(1, 6);
$$;
