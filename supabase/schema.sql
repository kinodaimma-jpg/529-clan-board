-- Supabase SQL Editor에서 전체 실행하세요.
create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author text not null default '익명 사용자',
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 3000),
  password_hash text not null,
  views integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author text not null default '익명 사용자',
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  unique(post_id, voter_id)
);

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists likes_post_id_idx on public.likes(post_id);

create or replace function public.increment_post_views(post_uuid uuid)
returns void language sql security definer
set search_path = public
as $$ update public.posts set views = views + 1 where id = post_uuid; $$;

-- 브라우저에서 DB에 직접 접근하지 않도록 RLS를 켜고 공개 정책은 만들지 않습니다.
-- 읽기/쓰기 권한은 Netlify Function의 서버 전용 service-role 키로만 처리합니다.
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;

-- 조회수 RPC는 서버의 service_role에서만 실행할 수 있습니다.
revoke all on function public.increment_post_views(uuid) from public, anon, authenticated;
grant execute on function public.increment_post_views(uuid) to service_role;


-- 관리자 전용 공통 배너 설정 (모든 클랜원에게 동일하게 표시)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- Netlify 서버의 service_role 키로만 접근합니다. anon/authenticated 정책은 만들지 않습니다.
