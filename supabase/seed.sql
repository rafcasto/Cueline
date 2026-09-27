-- Phase 1: one hardcoded organisation and room for your own webinars.
-- Add yourself to org_members after your first sign-in:
--   insert into public.org_members (org_id, user_id, role)
--   values ('00000000-0000-0000-0000-000000000001', '<your auth.users id>', 'owner');
insert into public.organisations (id, name, plan)
values ('00000000-0000-0000-0000-000000000001', 'Cueline', 'pro')
on conflict (id) do nothing;

insert into public.rooms (id, org_id, slug, name)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'main', 'Main room')
on conflict (id) do nothing;
