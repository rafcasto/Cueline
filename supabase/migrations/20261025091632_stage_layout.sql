-- Stage layout: where the presenter video sits against the deck page.
--
-- The host picks one of four arrangements in the live panel: the deck with the camera in
-- the corner (the default), a talking head (camera full stage, deck hidden), side by side
-- (deck left, camera right, half each), or a custom position the host drags into place.
-- { "mode": "default" | "talking_head" | "split" | "custom", "video": { "x", "y", "w" } }
-- with the box in percent of a 16:9 stage; see apps/web/src/lib/stage-layout.ts.
--
-- The session carries the live value, so a change rides the session:{id} broadcast that
-- already fires on every sessions write and attendees follow it at once. The room keeps
-- the host's last choice as the starting layout of the next session.

alter table public.sessions add column layout jsonb not null default '{"mode":"default"}'::jsonb;
alter table public.rooms add column stage_layout jsonb not null default '{"mode":"default"}'::jsonb;
