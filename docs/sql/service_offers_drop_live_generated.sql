-- Generated from live schema reconciliation output (22 Apr 2026)
-- Review and run ONE of the variants below in Supabase SQL Editor.

-- Variant A: exact generated drop list (includes tags/images)
-- begin;
-- alter table public.service_offers
--   drop column if exists capacity_limit,
--   drop column if exists availability,
--   drop column if exists category_focus,
--   drop column if exists validity_period,
--   drop column if exists state_province,
--   drop column if exists contact_preferences,
--   drop column if exists working_hours,
--   drop column if exists city,
--   drop column if exists pricing_info,
--   drop column if exists pincode,
--   drop column if exists coverage_area,
--   drop column if exists application_deadline,
--   drop column if exists start_date,
--   drop column if exists benefits,
--   drop column if exists tags,
--   drop column if exists images;
-- commit;

-- Variant B: safer UX-preserving drop list (keeps tags/images)
begin;
alter table public.service_offers
  drop column if exists capacity_limit,
  drop column if exists availability,
  drop column if exists category_focus,
  drop column if exists validity_period,
  drop column if exists state_province,
  drop column if exists contact_preferences,
  drop column if exists working_hours,
  drop column if exists city,
  drop column if exists pricing_info,
  drop column if exists pincode,
  drop column if exists coverage_area,
  drop column if exists application_deadline,
  drop column if exists start_date,
  drop column if exists benefits;
commit;

-- Post-check
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_offers'
order by ordinal_position;
