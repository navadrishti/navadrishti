-- Shared storage for auth rate limits, phone OTPs and password reset tokens so they
-- hold across server instances. Only the service role (via the functions below) touches these.

create table if not exists public.auth_rate_limits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);

create index if not exists auth_rate_limits_key_hit_at_idx
  on public.auth_rate_limits (key, hit_at);

create index if not exists auth_rate_limits_hit_at_idx
  on public.auth_rate_limits (hit_at);

create table if not exists public.auth_one_time_codes (
  id bigint generated always as identity primary key,
  purpose text not null check (purpose in ('phone_otp', 'password_reset')),
  subject text not null,
  user_id integer references public.users (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (purpose, subject)
);

create index if not exists auth_one_time_codes_purpose_code_hash_idx
  on public.auth_one_time_codes (purpose, code_hash);

create index if not exists auth_one_time_codes_expires_at_idx
  on public.auth_one_time_codes (expires_at);

alter table public.auth_rate_limits enable row level security;
alter table public.auth_one_time_codes enable row level security;

revoke all on table public.auth_rate_limits from anon, authenticated;
revoke all on table public.auth_one_time_codes from anon, authenticated;
grant all on table public.auth_rate_limits to service_role;
grant all on table public.auth_one_time_codes to service_role;


create or replace function public.auth_throttle_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate_limits integer;
  v_codes integer;
begin
  -- The longest limiter window is well under a day.
  delete from auth_rate_limits where hit_at < now() - interval '1 day';
  get diagnostics v_rate_limits = row_count;

  delete from auth_one_time_codes where expires_at < now() or consumed_at is not null;
  get diagnostics v_codes = row_count;

  return v_rate_limits + v_codes;
end;
$$;


-- Sliding window: counts this key's hits inside the window and records a new hit only when allowed.
create or replace function public.auth_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => p_window_seconds);
  v_count integer;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));

  delete from auth_rate_limits r where r.key = p_key and r.hit_at <= v_now - v_window;

  select count(*), min(r.hit_at) into v_count, v_oldest
  from auth_rate_limits r
  where r.key = p_key;

  if v_count >= p_limit then
    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_oldest + v_window - v_now))))::integer;
    return;
  end if;

  insert into auth_rate_limits (key, hit_at) values (p_key, v_now);

  if random() < 0.01 then
    perform auth_throttle_cleanup();
  end if;

  return query select true, p_limit - v_count - 1, 0;
end;
$$;


-- Replaces any earlier code for (purpose, subject) unless one was issued within p_resend_seconds.
create or replace function public.auth_code_issue(
  p_purpose text,
  p_subject text,
  p_code_hash text,
  p_ttl_seconds integer,
  p_resend_seconds integer default 0,
  p_user_id integer default null
)
returns table (issued boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing auth_one_time_codes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_purpose || ':' || p_subject));

  select * into v_existing
  from auth_one_time_codes c
  where c.purpose = p_purpose and c.subject = p_subject;

  if found
    and v_existing.consumed_at is null
    and v_existing.expires_at > v_now
    and v_existing.created_at > v_now - make_interval(secs => p_resend_seconds) then
    return query select
      false,
      greatest(1, ceil(extract(epoch from (v_existing.created_at + make_interval(secs => p_resend_seconds) - v_now))))::integer;
    return;
  end if;

  insert into auth_one_time_codes as c (purpose, subject, user_id, code_hash, expires_at, attempts, consumed_at, created_at)
  values (p_purpose, p_subject, p_user_id, p_code_hash, v_now + make_interval(secs => p_ttl_seconds), 0, null, v_now)
  on conflict (purpose, subject) do update set
    user_id = excluded.user_id,
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    consumed_at = null,
    created_at = excluded.created_at;

  if random() < 0.05 then
    perform auth_throttle_cleanup();
  end if;

  return query select true, 0;
end;
$$;


-- One guess against the live code for (purpose, subject). Status is one of
-- 'ok' (now consumed), 'missing', 'expired' (discarded), 'invalid' or 'locked' (discarded after p_max_attempts misses).
create or replace function public.auth_code_attempt(
  p_purpose text,
  p_subject text,
  p_code_hash text,
  p_max_attempts integer
)
returns table (status text, attempts integer, user_id integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code auth_one_time_codes%rowtype;
  v_attempts integer;
begin
  select * into v_code
  from auth_one_time_codes c
  where c.purpose = p_purpose and c.subject = p_subject and c.consumed_at is null
  for update;

  if not found then
    return query select 'missing'::text, 0, null::integer;
    return;
  end if;

  if v_code.expires_at <= clock_timestamp() then
    delete from auth_one_time_codes c where c.id = v_code.id;
    return query select 'expired'::text, v_code.attempts, v_code.user_id;
    return;
  end if;

  if v_code.code_hash = p_code_hash then
    update auth_one_time_codes c set consumed_at = clock_timestamp() where c.id = v_code.id;
    return query select 'ok'::text, v_code.attempts, v_code.user_id;
    return;
  end if;

  update auth_one_time_codes c
  set attempts = c.attempts + 1
  where c.id = v_code.id
  returning c.attempts into v_attempts;

  if v_attempts >= p_max_attempts then
    delete from auth_one_time_codes c where c.id = v_code.id;
    return query select 'locked'::text, v_attempts, v_code.user_id;
    return;
  end if;

  return query select 'invalid'::text, v_attempts, v_code.user_id;
end;
$$;


-- Looks up an unconsumed code by its hash; expired rows are returned so callers can say so.
create or replace function public.auth_code_find(p_purpose text, p_code_hash text)
returns table (subject text, user_id integer, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.subject, c.user_id, c.expires_at
  from auth_one_time_codes c
  where c.purpose = p_purpose and c.code_hash = p_code_hash and c.consumed_at is null
  limit 1;
$$;


-- Marks a code used. Returns false when it was already consumed, replaced or expired.
create or replace function public.auth_code_consume(p_purpose text, p_subject text, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz;
begin
  update auth_one_time_codes c
  set consumed_at = clock_timestamp()
  where c.purpose = p_purpose
    and c.subject = p_subject
    and c.code_hash = p_code_hash
    and c.consumed_at is null
  returning c.expires_at into v_expires_at;

  return found and v_expires_at > clock_timestamp();
end;
$$;


revoke all on function public.auth_throttle_cleanup() from public, anon, authenticated;
revoke all on function public.auth_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.auth_code_issue(text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.auth_code_attempt(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.auth_code_find(text, text) from public, anon, authenticated;
revoke all on function public.auth_code_consume(text, text, text) from public, anon, authenticated;

grant execute on function public.auth_throttle_cleanup() to service_role;
grant execute on function public.auth_rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.auth_code_issue(text, text, text, integer, integer, integer) to service_role;
grant execute on function public.auth_code_attempt(text, text, text, integer) to service_role;
grant execute on function public.auth_code_find(text, text) to service_role;
grant execute on function public.auth_code_consume(text, text, text) to service_role;
