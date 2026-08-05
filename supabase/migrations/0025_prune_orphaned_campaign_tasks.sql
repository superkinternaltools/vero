-- One-time cleanup: task generation only ever upserted tasks, never deleted
-- them when a store was removed from a campaign's targeting. Any campaign
-- edited before the code fix (pruneTasksForStores in updateCampaign) is left
-- with orphaned tasks for stores it no longer targets, inflating store counts
-- on Summary/Leaderboard. Submissions cascade-delete with their task.
--
-- Safe to run repeatedly: it only ever removes tasks whose store is not in
-- that campaign's current campaign_stores list, so campaigns that were never
-- affected lose nothing.
delete from public.tasks t
where not exists (
  select 1
  from public.campaign_stores cs
  where cs.campaign_id = t.campaign_id
    and cs.store_id = t.store_id
);
