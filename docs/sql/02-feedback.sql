-- よりみっけ ── アプリへの意見（feedback）を投稿できるようにする追加
--
-- 01-posts.sql を実行したあとに、SQL Editor へ貼って Run してください。
-- posts の kind に 'feedback' を足すだけの小さな変更です。

alter table public.posts drop constraint if exists posts_kind_check;

alter table public.posts add constraint posts_kind_check
  check (kind in ('new_spot', 'review', 'report', 'photo', 'feedback'));

-- 意見だけを新しい順に見るとき用（管理画面で使います）。
create index if not exists posts_feedback_idx
  on public.posts (created_at desc) where kind = 'feedback';
