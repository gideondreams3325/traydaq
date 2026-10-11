-- Authenticated Firebase comment reactions stored behind Supabase Edge.
-- Only server_role may read/write; Firebase tokens are verified by the Edge function.
create table if not exists public.traydaq_comment_likes (
 post_id text not null check (post_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 comment_id text not null check (comment_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 viewer_uid text not null check (viewer_uid ~ '^[A-Za-z0-9_-]{1,128}$'),
 created_at timestamptz not null default now(),
 primary key (post_id,comment_id,viewer_uid)
);
alter table public.traydaq_comment_likes enable row level security;
revoke all on public.traydaq_comment_likes from public,anon,authenticated;
grant select,insert,delete on public.traydaq_comment_likes to service_role;
create index if not exists traydaq_comment_likes_post_idx
 on public.traydaq_comment_likes(post_id,comment_id);
do $p$
begin
 if not exists (select 1 from pg_policies where schemaname='public'
   and tablename='traydaq_comment_likes' and policyname='traydaq_comment_likes_server_only')
 then
   create policy traydaq_comment_likes_server_only on public.traydaq_comment_likes
     as restrictive for all to anon,authenticated using(false) with check(false);
 end if;
end $p$;
create or replace function public.traydaq_comment_like_snapshot(p_post_id text,p_viewer_uid text default null)
returns jsonb language sql stable security invoker set search_path=public as $f$
select coalesce(jsonb_object_agg(t.comment_id,jsonb_build_object('count',t.total,'liked',t.liked)), '{}'::jsonb)
from (
 select comment_id,count(*)::integer total,coalesce(bool_or(viewer_uid=p_viewer_uid),false) liked
 from public.traydaq_comment_likes where post_id=p_post_id group by comment_id
) t;
$f$;
revoke all on function public.traydaq_comment_like_snapshot(text,text) from public,anon,authenticated;
grant execute on function public.traydaq_comment_like_snapshot(text,text) to service_role;
