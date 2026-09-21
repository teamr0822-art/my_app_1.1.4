# ログイン機能のセットアップ（Supabase）

ログインは任意です。下の設定をするまでは、ログイン画面に「準備中」と出るだけで、
アプリの他の機能はすべてそのまま使えます。

## 1. Supabase のプロジェクトを作る

1. https://supabase.com で GitHub アカウントを使ってサインアップ
2. 「New project」→ 名前（例: yorimikke）、データベースのパスワード、リージョンは **Tokyo** を選んで作成
3. 左メニュー「Project Settings」→「API」（または「Data API」/「API Keys」）を開き、次の2つを控える
   - **Project URL**（`https://xxxx.supabase.co`）
   - **anon / publishable キー**（公開してよいほうのキー。`service_role` / `secret` キーは**絶対に使わない**）

## 2. ログイン後に戻ってくる先を設定する

「Authentication」→「URL Configuration」

- **Site URL**: `https://my-app-1-1-4.vercel.app`
- **Redirect URLs**: 同じURLを追加

確認メールのリンクを押すと、ここに戻ってきてログイン済みになります。

## 3. Vercel に環境変数を入れる

Vercel のプロジェクト →「Settings」→「Environment Variables」に2つ追加（Production / Preview 両方にチェック）

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 1-3 の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1-3 の anon / publishable キー |

**環境変数は、入れたあとのデプロイから効きます。** GitHub に何か1つコミットして新しいデプロイを作ってください（「Redeploy」は使わない）。

## 4. 確認

1. スマホでアプリを開く →「新規登録」→ メールアドレスとパスワード（8文字以上）
2. 届いたメールのリンクを押す → アプリに戻り、設定画面の上に名前が出れば成功
3. 設定画面の「ログアウト」→「ログイン」で入り直せることも確認

## メモ

- 発表のデモでメール確認を省きたいときは「Authentication」→「Sign In / Providers」→「Email」の **Confirm email** をオフにすると、登録した瞬間にログイン状態になります。
- Supabase の無料プランは送信できる確認メールの数が少ない（1時間に数通）ので、試すときは同じアドレスで何度も登録しないこと。
- ログイン状態はその端末の localStorage（`yorimikke-session-v1`）に保存されます。
- パスワードを忘れたときの再設定画面はまだありません（Supabase の管理画面から該当ユーザーを削除すれば登録し直せます）。
