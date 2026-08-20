-- Vero — 0032 allow vero_sync as a contest_data_batches origin
-- Campaign Data can now arrive by syncing a real Vero campaign's own task
-- reviews, not just a csv/sheet/dummy upload.

alter table public.contest_data_batches
  drop constraint contest_data_batches_origin_check;

alter table public.contest_data_batches
  add constraint contest_data_batches_origin_check
  check (origin in ('csv', 'sheet', 'dummy', 'vero_sync'));
