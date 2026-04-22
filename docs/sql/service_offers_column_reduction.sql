-- Service offers column reduction helper
-- Run in Supabase SQL editor after taking a backup/snapshot.

-- 1) Inspect current columns first
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

-- 2) Optional: backup table before destructive changes
-- create table service_offers_backup_2026_04_22 as
-- select * from public.service_offers;

-- 3) Ensure requirements exists as jsonb
alter table public.service_offers
  add column if not exists requirements jsonb;

-- Optional: materialize core fields as physical columns if you want direct SQL filtering without JSON access.
alter table public.service_offers
  add column if not exists transaction_type text;

update public.service_offers
set requirements = coalesce(requirements, '{}'::jsonb)
where requirements is null;

-- 3b) Backfill transaction_type from requirements when present.
update public.service_offers
set transaction_type = coalesce(transaction_type, requirements->>'transaction_type')
where transaction_type is null;

-- 4) Backfill legacy columns into requirements JSON (idempotent + schema-aware)
do $$
declare
  col text;
  expr text := '';
  legacy_columns text[] := array[
    'amount',
    'location_scope',
    'conditions',
    'item',
    'quantity',
    'delivery_scope',
    'skill',
    'capacity',
    'duration',
    'scope',
    'budget_range',
    'contact_info',
    'images',
    'tags',
    'wage_info',
    'employment_type',
    'experience_requirements',
    'skills_required',
    'benefits'
  ];
begin
  foreach col in array legacy_columns loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'service_offers'
        and column_name = col
    ) then
      if expr <> '' then
        expr := expr || ' || ';
      end if;
      expr := expr || format('jsonb_strip_nulls(jsonb_build_object(%L, %I))', col, col);
    end if;
  end loop;

  if expr = '' then
    raise notice 'Section 4 skipped: no legacy columns found to backfill.';
  else
    execute format(
      'update public.service_offers
       set requirements = coalesce(requirements, ''{}''::jsonb) || (%s);',
      expr
    );
  end if;
end $$;

-- 5) Keep submitted_for_review_at for SLA automation; make sure it has a value for pending rows
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_offers'
      and column_name = 'submitted_for_review_at'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_offers'
      and column_name = 'admin_status'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_offers'
      and column_name = 'created_at'
  ) then
    update public.service_offers
    set submitted_for_review_at = coalesce(submitted_for_review_at, created_at)
    where admin_status = 'pending'
      and submitted_for_review_at is null;
  else
    raise notice 'Section 5 skipped: required columns are missing in current schema.';
  end if;
end $$;

-- 6) Drop legacy columns ONLY after app code is updated and validated
-- Remove/comment any columns you still need.
-- alter table public.service_offers
--   drop column if exists item,
--   drop column if exists quantity,
--   drop column if exists delivery_scope,
--   drop column if exists skill,
--   drop column if exists capacity,
--   drop column if exists scope,
--   drop column if exists budget_range,
--   drop column if exists contact_info,
--   drop column if exists images,
--   drop column if exists tags,
--   drop column if exists verified,
--   drop column if exists city,
--   drop column if exists state_province,
--   drop column if exists pincode,
--   drop column if exists benefits,
--   drop column if exists provider_id;

-- Keep these while admin UI depends on them:
--   duration,
--   wage_info,
--   employment_type,
--   experience_requirements,
--   skills_required

-- 7) Sanity check
select id, creator_id, title, offer_type, category, status, admin_status, created_at
from public.service_offers
order by created_at desc
limit 20;
