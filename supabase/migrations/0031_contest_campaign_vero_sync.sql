-- Vero — 0031 contest campaign data sync from Vero
-- Campaign Data can now come from a real Vero campaign's own tasks +
-- submissions, not just a CSV upload. Synced rows get campaign_id set so a
-- re-sync can find and replace exactly its own rows without touching
-- CSV-uploaded rows for other campaigns.

alter table public.contest_campaign_rows
  add column campaign_id uuid references public.campaigns (id);

create index contest_campaign_rows_campaign_month_idx
  on public.contest_campaign_rows (campaign_id, month);
