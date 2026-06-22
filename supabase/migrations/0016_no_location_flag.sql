-- Vero — 0016 no_location_flag
-- Soft flag on submissions where the SAE did not grant GPS permission or
-- location timed out. Treated the same as geofence/duplicate flags:
-- visible to reviewers but never blocks the upload.

alter table public.submissions
  add column if not exists no_location_flag boolean not null default false;
