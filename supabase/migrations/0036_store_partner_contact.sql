-- Vero — 0036 store partner contact
-- FOFO Store Partners stop being modeled solely as logins mapped via
-- user_stores/job_titles. A lightweight contact (name/email/phone) now lives
-- directly on the store, so a partner can be reached (e.g. over WhatsApp,
-- later) without ever needing a Vero account. Existing Store Partner logins
-- are left completely untouched — this is an additional channel, not a
-- replacement (see backfill script for copying existing profile data over).

alter table public.stores
  add column partner_name  text,
  add column partner_email text,
  add column partner_phone text;
