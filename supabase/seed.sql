-- Phase 1: one hardcoded organisation with a first room. Hosts create further rooms from /host;
-- every room (this one included) gets its email sequence from the rooms_seed_emails trigger.
-- Add yourself to org_members after your first sign-in:
--   insert into public.org_members (org_id, user_id, role)
--   values ('00000000-0000-0000-0000-000000000001', '<your auth.users id>', 'owner');
insert into public.organisations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Cueline')
on conflict (id) do nothing;

-- The first room runs at Pro without a subscription: the plan belongs to the room, and this one is complimentary.
insert into public.rooms (id, org_id, slug, name, plan, complimentary)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'main', 'Main room', 'pro', true)
on conflict (id) do nothing;
