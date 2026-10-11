-- TRAYDAQ authenticated video views ledger.
-- Live table uses service_role writes only from the Supabase Edge Function.
-- Firebase remains the identity provider and the public RTDB post counter.
create table if not exists public.traydaq_video_views (
  post_id text not null check (post_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  viewer_uid text not null check (viewer_uid ~ '^[A-Za-z0-9_-]{1,128}$'),
  viewed_at timestamptz not null default now(),
  primary key (post_id, viewer_uid)
);
alter table public.traydaq_video_views enable row level security;
revoke all on table public.traydaq_video_views from public, anon, authenticated;
grant select, insert on table public.traydaq_video_views to service_role;
create index if not exists traydaq_video_views_post_count_idx
  on public.traydaq_video_views (post_id);
do $policy$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
    and tablename='traydaq_video_views'
    and policyname='traydaq_video_views_private_server_only') then
    create policy traydaq_video_views_private_server_only
      on public.traydaq_video_views as restrictive for all
      to anon, authenticated using (false) with check (false);
  end if;
end $policy$;
