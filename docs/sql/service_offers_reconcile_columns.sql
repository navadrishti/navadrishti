-- Service Offers column reconciliation
-- Purpose: derive keep and drop candidates from the live schema you actually have.
--
-- Run this in Supabase SQL Editor.
-- It does NOT drop anything automatically.

-- 1) List current columns in order
select
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_offers'
order by ordinal_position;

-- 2) Define what you said you want to keep + essential system/admin columns
with keep_list as (
  select unnest(array[
    -- Core business fields from form
    'title',
    'description',
    'offer_type',
    'transaction_type',
    'amount',
    'location_scope',
    'conditions',

    -- Essential identifiers/ownership/time/status
    'id',
    'creator_id',
    'created_at',
    'updated_at',
    'status',

    -- Admin-related fields (kept intentionally)
    'admin_status',
    'admin_reviewed_at',
    'admin_reviewed_by',
    'admin_comments',
    'submitted_for_review_at',

    -- Keep while app still uses normalized/details JSON
    'requirements',

    -- Keep while list/search/pricing flows still depend on these
    'category',
    'location',
    'price_type',
    'price_amount',
    'price_description',

    -- Keep while current admin UI depends on legacy fields
    'duration',
    'wage_info',
    'employment_type',
    'experience_requirements',
    'skills_required'
  ]) as column_name
),
current_cols as (
  select c.column_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'service_offers'
),
matched_keep as (
  select c.column_name
  from current_cols c
  join keep_list k on k.column_name = c.column_name
),
to_drop as (
  select c.column_name
  from current_cols c
  left join keep_list k on k.column_name = c.column_name
  where k.column_name is null
)
select
  'KEEP' as action,
  column_name
from matched_keep
union all
select
  'DROP_CANDIDATE' as action,
  column_name
from to_drop
order by action, column_name;

-- 3) Generate exact ALTER TABLE statement for your live schema
with keep_list as (
  select unnest(array[
    'title','description','offer_type','transaction_type','amount','location_scope','conditions',
    'id','creator_id','created_at','updated_at','status',
    'admin_status','admin_reviewed_at','admin_reviewed_by','admin_comments','submitted_for_review_at',
    'requirements','category','location','price_type','price_amount','price_description',
    'duration','wage_info','employment_type','experience_requirements','skills_required'
  ]) as column_name
),
to_drop as (
  select c.column_name
  from information_schema.columns c
  left join keep_list k on k.column_name = c.column_name
  where c.table_schema = 'public'
    and c.table_name = 'service_offers'
    and k.column_name is null
)
select
  case
    when count(*) = 0 then '-- Nothing to drop. Current schema already matches keep list.'
    else
      'alter table public.service_offers\n  ' ||
      string_agg(format('drop column if exists %I', column_name), ',\n  ') ||
      ';'
  end as generated_drop_sql
from to_drop;
