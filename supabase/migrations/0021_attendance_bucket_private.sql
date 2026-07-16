-- Attendance photos are employee selfies used as a biometric identity
-- reference (Phase 2 face-match) — more sensitive than a shelf/display
-- photo, so unlike the (also public, pre-existing) submissions bucket, this
-- one goes private. Reads now go through short-lived signed URLs generated
-- server-side from photo_path; photo_url is no longer treated as a working
-- public URL.
update storage.buckets set public = false where id = 'attendance';

-- photo_url was only ever a precomputed public URL, which no longer resolves
-- against a private bucket. Reads now derive a signed URL from photo_path on
-- demand, so the column stops being required going forward (left in place,
-- unused, rather than dropped).
alter table public.attendance_punches alter column photo_url drop not null;
alter table public.attendance_references alter column photo_url drop not null;
