-- Recordings are kept for the plan's retention (30 days on Starter, a year on Pro; see
-- docs/BUSINESS-MODEL.md) and deleted from object storage by the nightly sweep
-- (/api/recordings/sweep). The expiry is stamped at go-live from the plan in force; the
-- sweep deletes the MP4 and the HLS segments, then marks the row.
alter table public.sessions
  add column recording_expires_at timestamptz,
  add column recording_deleted_at timestamptz;
create index sessions_recording_expiry_idx on public.sessions (recording_expires_at)
  where recording_url is not null and recording_deleted_at is null;
