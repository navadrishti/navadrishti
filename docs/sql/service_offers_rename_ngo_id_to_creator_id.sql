-- Rename service_offers owner column from ngo_id to creator_id
-- Run this once in Supabase SQL Editor.

begin;

-- 1) Rename column if old column exists and new one does not.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_offers'
      and column_name = 'ngo_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_offers'
      and column_name = 'creator_id'
  ) then
    alter table public.service_offers rename column ngo_id to creator_id;
  end if;
end $$;

-- 2) Optional: rename FK constraint name to match new column name if old name exists.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'service_offers_ngo_id_fkey'
  ) then
    alter table public.service_offers
      rename constraint service_offers_ngo_id_fkey to service_offers_creator_id_fkey;
  end if;
end $$;

-- 3) Helpful index for owner-based queries.
create index if not exists idx_service_offers_creator_id
  on public.service_offers (creator_id);

commit;

-- 4) Verify
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_offers'
  and column_name in ('creator_id', 'ngo_id')
order by column_name;
