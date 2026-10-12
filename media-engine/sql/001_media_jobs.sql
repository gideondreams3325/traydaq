-- TRAYDAQ Media Engine v1. Apply only after the FFmpeg worker is configured.
-- Auth remains Firebase. All SQL/API calls use server-only service-role credentials.
-- Existing uploads and Firebase post records are unaffected.
create table if not exists public.traydaq_media_jobs (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null check (firebase_uid ~ '^[A-Za-z0-9_-]{1,128}$'),
  source_path text not null unique
    check (source_path ~ '^media/[A-Za-z0-9_-]{1,128}/posts/[A-Za-z0-9_-]{10,140}\.(mp4|webm|mov|m4v|3gp)$'),
  state text not null default 'queued' check (state in ('queued','processing','ready','failed')),
  attempts int not null default 0 check (attempts between 0 and 3),
  lease_started_at timestamptz,
  hls_path text,
  mp4_path text,
  poster_path text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ready_has_media check (state <> 'ready' or (hls_path is not null and mp4_path is not null))
);
create index if not exists traydaq_media_jobs_queue_idx
  on public.traydaq_media_jobs (state,created_at) where attempts < 3;
create index if not exists traydaq_media_jobs_owner_idx
  on public.traydaq_media_jobs (firebase_uid,created_at desc);
alter table public.traydaq_media_jobs enable row level security;
revoke all on public.traydaq_media_jobs from PUBLIC, anon, authenticated;
grant select,insert,update on public.traydaq_media_jobs to service_role;

-- A single atomic claim prevents two workers from processing the same queued job.
-- SECURITY INVOKER + REVOKE EXECUTE keeps this unavailable to Android clients.
create or replace function public.traydaq_media_claim_next()
returns setof public.traydaq_media_jobs
language plpgsql security invoker set search_path=''
as $$
begin
  -- A worker terminated during its final attempt must not remain 'processing'
  -- forever. Only expired leases are marked failed.
  update public.traydaq_media_jobs
    set state='failed',error_code='WORKER_LEASE_EXPIRED',updated_at=now()
   where state='processing' and attempts>=3
     and lease_started_at < now()-interval '15 minutes';

  return query
  with next_job as (
    select j.id
      from public.traydaq_media_jobs as j
     where j.attempts < 3 and
           (j.state='queued' or (j.state='processing' and
             j.lease_started_at < now()-interval '15 minutes'))
     order by j.created_at asc
     for update skip locked
     limit 1
  )
  update public.traydaq_media_jobs as item
     set state='processing',
         attempts=item.attempts+1,
         lease_started_at=now(),
         updated_at=now(),
         error_code=null
    from next_job
   where item.id=next_job.id
  returning item.*;
end $$;
revoke all on function public.traydaq_media_claim_next() from PUBLIC, anon, authenticated;
grant execute on function public.traydaq_media_claim_next() to service_role;
