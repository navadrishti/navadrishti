-- Service Offers: Drop Batch 1 (safe-first)
-- Run this in Supabase SQL Editor after running prep steps in:
-- docs/sql/service_offers_column_reduction.sql (sections 1-5)
--
-- Batch 1 columns to drop:
-- item, quantity, delivery_scope, skill, capacity, scope, budget_range, benefits, provider_id
--
-- Admin-related columns are intentionally NOT touched.

-- 0) Pre-check: confirm current columns and row count
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_offers'
  and column_name in (
    'item',
    'quantity',
    'delivery_scope',
    'skill',
    'capacity',
    'scope',
    'budget_range',
    'benefits',
    'provider_id'
  )
order by column_name;

select count(*) as service_offers_count
from public.service_offers;

-- 1) Drop Batch 1 columns
begin;

alter table public.service_offers
  drop column if exists item,
  drop column if exists quantity,
  drop column if exists delivery_scope,
  drop column if exists skill,
  drop column if exists capacity,
  drop column if exists scope,
  drop column if exists budget_range,
  drop column if exists benefits,
  drop column if exists provider_id;

commit;

-- 2) Post-check: ensure columns are gone and data remains
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_offers'
  and column_name in (
    'item',
    'quantity',
    'delivery_scope',
    'skill',
    'capacity',
    'scope',
    'budget_range',
    'benefits',
    'provider_id'
  )
order by column_name;

select count(*) as service_offers_count_after
from public.service_offers;

-- 3) Quick sanity sample
select id, creator_id, title, offer_type, transaction_type, amount, location_scope, status, admin_status, created_at
from public.service_offers
order by created_at desc
limit 20;
