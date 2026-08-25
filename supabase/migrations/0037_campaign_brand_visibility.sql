-- Vero — 0037 campaign brand visibility
-- New classification for campaigns like Tide, Ariel, Surf Excel etc. that
-- track a specific brand's in-store presence (as opposed to generic
-- compliance/photo campaigns). Brand Visibility campaigns can also carry an
-- admin-defined list of SKUs (name, target qty, target facings, target
-- shelf #) describing what should be stocked — same idea as payout_tiers,
-- just a different shape.

alter table public.campaigns
  add column is_brand_visibility boolean not null default false,
  add column skus jsonb not null default '[]'::jsonb;
