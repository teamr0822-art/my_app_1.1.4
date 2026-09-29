-- よりみっけ ── 投稿機能のためのテーブル一式
--
-- Supabase ダッシュボード → SQL Editor に貼り付けて「Run」を押してください。
-- 一度だけ実行します。二度実行しても壊れないように書いてあります。
--
-- ここで作るもの
--   profiles           … 利用者ごとの情報（ニックネーム、属性）
--   contributor_codes  … 属性を付ける合言葉。中身は誰からも読めない
--   posts              … 投稿（新規スポット・口コミ・通報・写真）
--   post-photos        … 写真の保管場所（ストレージ）
--
-- 方針: 投稿はいったん貯めるだけ。自分の投稿は自分だけが見られる。
--       他人の投稿は、アプリからは一切読めません（管理画面でのみ見えます）。

-- ───────────────────────────────────────────── profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  -- general=一般 / kyoryokutai=地域おこし協力隊 / company=企業 / official=公式情報提供者
  role text not null default 'general'
    check (role in ('general', 'kyoryokutai', 'company', 'official')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "自分の profile を読む" on public.profiles;
create policy "自分の profile を読む" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "自分の profile を作る" on public.profiles;
create policy "自分の profile を作る" on public.profiles
  for insert with check (auth.uid() = id);

-- 更新のポリシーは作らない。
-- 作ると role（属性）まで本人に書き換えられてしまい、合言葉の意味がなくなる。
-- ニックネームの変更は、下の set_nickname() 経由だけにする。

create or replace function public.set_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare
  clean text := nullif(btrim(p_nickname), '');
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  clean := left(clean, 30);
  insert into public.profiles (id, nickname) values (auth.uid(), clean)
  on conflict (id) do update set nickname = excluded.nickname, updated_at = now();
  return clean;
end;
$$;

revoke all on function public.set_nickname(text) from public;
grant execute on function public.set_nickname(text) to authenticated;

-- 新規登録と同時に profile を作る。
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────── contributor_codes

create table if not exists public.contributor_codes (
  code text primary key,
  role text not null check (role in ('kyoryokutai', 'company', 'official')),
  -- 画面に出す名前（例: 松江市地域おこし協力隊）
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS を有効にしたうえで、ポリシーを1つも作らない。
-- こうするとアプリ側からは1行も読めない（下の関数だけが中を見られる）。
alter table public.contributor_codes enable row level security;

-- 合言葉を入れて属性を付ける。合言葉そのものはアプリに返さない。
create or replace function public.claim_contributor_role(p_code text)
returns table (role text, label text)
language plpgsql security definer set search_path = public as $$
declare
  found_role text;
  found_label text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select c.role, c.label into found_role, found_label
  from public.contributor_codes c
  where c.code = trim(p_code) and c.active;

  if found_role is null then
    raise exception '合言葉が違います';
  end if;

  insert into public.profiles (id, role) values (auth.uid(), found_role)
  on conflict (id) do update set role = excluded.role, updated_at = now();

  return query select found_role, found_label;
end;
$$;

revoke all on function public.claim_contributor_role(text) from public;
grant execute on function public.claim_contributor_role(text) to authenticated;

-- 合言葉の例。本番で使う言葉に必ず変えてください。
insert into public.contributor_codes (code, role, label) values
  ('kyoryoku-2026', 'kyoryokutai', '地域おこし協力隊'),
  ('kigyou-2026',   'company',     '企業'),
  ('koushiki-2026', 'official',    '公式情報提供者')
on conflict (code) do nothing;

-- ───────────────────────────────────────────────── posts

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- new_spot=新しい場所 / review=口コミ / report=通報 / photo=写真だけ
  kind text not null check (kind in ('new_spot', 'review', 'report', 'photo')),
  -- 従来スポットへの投稿のときだけ入る（data/areas の id。例: matsue-castle）
  target_spot_id text,
  title text,
  body text,
  lat double precision,
  lng double precision,
  address text,
  category text,
  -- 駐車場・駐輪場・トイレなど。{"parking":true,"bicycle":true,...}
  facilities jsonb not null default '{}'::jsonb,
  -- 口コミの星（1〜5）。それ以外は null
  rating smallint check (rating between 1 and 5),
  -- 通報の種類（間違い/危険/立入禁止 など）
  report_reason text,
  -- 写真の保管場所（post-photos の中のパス）
  photo_paths text[] not null default '{}',
  -- 投稿時点の属性。あとで見返すときに、誰が出した情報かを判断する material
  author_role text not null default 'general',
  -- pending=未確認 / accepted=採用 / rejected=見送り。いまは全部 pending のまま貯める
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists posts_user_idx on public.posts (user_id, created_at desc);
create index if not exists posts_target_idx on public.posts (target_spot_id, created_at desc);

alter table public.posts enable row level security;

drop policy if exists "自分の投稿を読む" on public.posts;
create policy "自分の投稿を読む" on public.posts
  for select using (auth.uid() = user_id);

drop policy if exists "自分として投稿する" on public.posts;
create policy "自分として投稿する" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "自分の投稿を消す" on public.posts;
create policy "自分の投稿を消す" on public.posts
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────── 写真の保管場所

insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', false)
on conflict (id) do nothing;

-- 自分のフォルダ（<自分のID>/…）にだけ置ける・読める。
drop policy if exists "自分の写真を置く" on storage.objects;
create policy "自分の写真を置く" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "自分の写真を読む" on storage.objects;
create policy "自分の写真を読む" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "自分の写真を消す" on storage.objects;
create policy "自分の写真を消す" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text);
