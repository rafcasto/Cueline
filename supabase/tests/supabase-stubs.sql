-- Stand-ins for what the Supabase platform provides (auth/realtime schemas, API roles) so the
-- migration can be exercised against a plain Postgres 16 in CI. Not used by `supabase db reset`.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create table auth.users(id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema realtime;
create table realtime.messages(id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
create function realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text default 'ROW')
returns void language plpgsql as $$
begin
  insert into realtime.messages(topic, extension, payload, event, private)
  values (topic_name, 'broadcast', jsonb_build_object('operation', operation, 'table', table_name, 'schema', table_schema, 'record', to_jsonb(new), 'old_record', to_jsonb(old)), event_name, true);
end $$;
-- Supabase default privileges for the API roles.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
