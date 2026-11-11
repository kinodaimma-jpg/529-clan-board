-- 5-29 게시판 카테고리 및 1분 작성 제한 업데이트
-- 기존 게시글/댓글은 삭제하지 않습니다.

-- 공통 설정 테이블이 이미 없다면 생성합니다.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- 기존 게시글은 기본 카테고리 '자유'로 분류됩니다.
alter table public.posts
  add column if not exists category text not null default 'free';

create index if not exists posts_category_created_at_idx
  on public.posts(category, created_at desc);

-- 사용자별 마지막 게시글 작성 시각을 저장합니다.
create table if not exists public.post_rate_limits (
  voter_id uuid primary key,
  last_post_at timestamptz not null
);
alter table public.post_rate_limits enable row level security;

-- 서버에서 원자적으로 1분 제한을 확인합니다.
-- 처음 작성하거나 마지막 작성 후 60초가 지났을 때만 true를 반환합니다.
create or replace function public.claim_post_slot(p_voter_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  insert into public.post_rate_limits(voter_id, last_post_at)
  values (p_voter_id, now())
  on conflict (voter_id) do update
    set last_post_at = now()
    where public.post_rate_limits.last_post_at <= now() - interval '1 minute'
  returning voter_id into claimed_id;

  return claimed_id is not null;
end;
$$;

revoke all on function public.claim_post_slot(uuid) from public, anon, authenticated;
grant execute on function public.claim_post_slot(uuid) to service_role;

-- 카테고리 이름은 app_settings에 저장되며, Netlify 서버만 읽고 쓸 수 있습니다.
insert into public.app_settings(key, value, updated_at)
values (
  'categories',
  '{"items":[{"key":"free","label":"자유"},{"key":"suggestion","label":"건의사항"},{"key":"report","label":"비매너"},{"key":"notice","label":"공지사항"}]}'::jsonb,
  now()
)
on conflict (key) do nothing;
