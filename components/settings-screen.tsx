"use client";
import { useState } from "react";

import { useSettings } from "@/lib/settings-context";
import { AREAS, STATS, DATA_SOURCE, SPOTS } from "@/lib/spots";
import { useVisited } from "@/lib/visited";
import { getSpot } from "@/lib/spots";
import { SHOW_SAMPLES, SAMPLE_VISITED_IDS, SAMPLE_VISITED_DAYS_AGO } from "@/lib/samples";
import { useAuth } from "@/lib/auth-context";
import { usePost } from "@/lib/post-context";
import { useT } from "@/lib/i18n";
import { LanguagePicker } from "@/components/language-picker";
import { useProfile } from "@/lib/profile";
import { useJourney } from "@/lib/journey";
import { JourneyCard } from "@/components/journey-card";
import { ContributorCard, MyPostsCard } from "@/components/my-posts";
import { saveNickname } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { replayOnboarding } from "@/components/onboarding";
import { MicOffIcon, VolumeIcon, SparkIcon, InfoIcon } from "@/components/icons";

const TTS_VOICES = [
  { id: "nova", label: "Nova（やわらか）" },
  { id: "alloy", label: "Alloy（標準）" },
  { id: "shimmer", label: "Shimmer（明るい）" },
  { id: "fable", label: "Fable（物語調）" },
];

function Toggle({
  on,
  onClick,
  label,
  danger,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      /* The pill itself stays 28px tall — the button around it is padded to the
         44px minimum so it can be hit reliably with a thumb. */
      className="relative flex h-11 w-12 shrink-0 items-center"
    >
      <span
        aria-hidden="true"
        className={`block h-7 w-12 rounded-full transition-colors ${
          on
            ? danger
              ? "bg-[var(--color-mute-accent)]"
              : "bg-[var(--color-green)]"
            : "bg-[var(--color-border)]"
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export function SettingsScreen() {
  const s = useSettings();
  const t = useT();
  const visited = useVisited();

  return (
    <div
      className={`flex flex-1 flex-col overflow-y-auto pb-[var(--tabbar-clearance)] ${
        s.muted ? "bg-[var(--color-mute-bg)]" : "bg-[var(--color-bg)]"
      }`}
    >
      <header className="px-5 pb-4 pt-[calc(20px+env(safe-area-inset-top))]">
        <h1 className="text-[22px] font-extrabold tracking-tight">{t("設定")}</h1>
        <p className="mt-1 text-[12px] text-[var(--color-ink-soft)]">
          {t("音声ガイドの動作をカスタマイズできます")}
        </p>
      </header>

      {/* アカウント。設定のいちばん上に置き、途中からでもログイン・新規登録できるようにする。 */}
      <AccountCard />

      {/* 言語。旅先で開いた人が最初に触るので、いちばん上に置く。 */}
      <section className="px-4 pb-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <LanguagePicker />
        </div>
      </section>

      {/* Mute mode — distinct restricted palette */}
      <section className="px-4">
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 ${
            s.muted
              ? "border-[var(--color-mute-border)] bg-[var(--color-mute-panel)]"
              : "border-[var(--color-border)] bg-[var(--color-panel)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              s.muted
                ? "bg-[var(--color-mute-accent)] text-white"
                : "bg-[var(--color-panel-soft)] text-[var(--color-ink-soft)]"
            }`}
          >
            {s.muted ? <MicOffIcon size={20} /> : <VolumeIcon size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">
              {t("ミュートモード")}{" "}
              <span
                className={
                  s.muted ? "text-[var(--color-mute-ink)]" : "text-[var(--color-ink-soft)]"
                }
              >
                {s.muted ? "ON" : "OFF"}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">{t("音声の入出力を止め、文字だけでご案内します。周囲に配慮したい場所で。")}</p>
          </div>
          <Toggle
            on={s.muted}
            danger
            label={t("ミュートモード")}
            onClick={() => s.toggle("muted")}
          />
        </div>
      </section>

      {/* 投稿。ログインしている人だけに出す（属性と履歴）。 */}
      <PostSection />

      {/* 歩いた距離。ログインした人だけの機能なので、していない人には案内だけ出す。 */}
      <SectionTitle>{t("歩いた距離")}</SectionTitle>
      <section className="px-4">
        <JourneySection />
      </section>

      {/* 訪れた記録。端末にしか残らないので、消す手段も同じ場所に置く。 */}
      <SectionTitle>{t("訪れた記録")}</SectionTitle>
      <section className="px-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="min-w-0">
            <p className="text-[15px] font-bold">
              {/* 0のときは数字を出さない。すぐ下に見本の「3か所」が並ぶので、
                  数字が2つ見えると食い違っているように読める。 */}
              {visited.count > 0 ? t("これまでに{n}か所", { n: visited.count }) : t("まだありません")}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">{t("案内中にスポットへ40m以内まで近づくと、自動で記録されます。この端末にだけ保存され、どこにも送られません。")}</p>
          </div>
          {visited.count > 0 && (
            <button
              type="button"
              onClick={() => visited.clearVisited()}
              className="min-h-11 shrink-0 rounded-xl border border-[var(--color-border)] px-3 text-[13px] font-bold text-[var(--color-ink-soft)]"
            >{t("消す")}</button>
          )}
        </div>
        {/* まだ1か所も訪れていない人へ、記録がたまるとどう見えるかを出す。 */}
        {visited.count === 0 && <VisitedSample />}
      </section>

      {/* 屋外モード: 晴天下で読めるかどうかは実用機能なので、設定の上のほうに置く */}
      <SectionTitle>{t("画面")}</SectionTitle>
      <section className="px-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="min-w-0">
            <p className="text-[15px] font-bold">
              {t("屋外モード")}{" "}
              <span className="text-[12px] font-bold text-[var(--color-ink-soft)]">
                {s.outdoor ? "ON" : "OFF"}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">{t("直射日光の下でも読めるように、文字と背景のコントラストを最大にします。")}</p>
          </div>
          <Toggle
            on={s.outdoor}
            label={t("屋外モード")}
            onClick={() => s.toggle("outdoor")}
          />
        </div>
      </section>

      {/* Voice section */}
      <SectionTitle>{t("音声エンジン")}</SectionTitle>
      <section className="px-4">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]">
          <Row
            label={t("音声の方式")}
            sub={t("サーバー音声が使えない時は自動で端末音声に切り替わります")}
          >
            <div className="flex gap-1 rounded-full bg-[var(--color-panel-soft)] p-1">
              {(["server", "browser"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => s.set("voiceEngine", e)}
                  className={`min-h-11 rounded-full px-4 text-[12px] font-bold transition-colors ${
                    s.voiceEngine === e
                      ? "bg-[var(--color-terracotta)] text-white"
                      : "text-[var(--color-ink-soft)]"
                  }`}
                >
                  {e === "server" ? t("高精度") : t("端末内蔵")}
                </button>
              ))}
            </div>
          </Row>

          <Divider />
          <Row label={t("読み上げの声")} sub={t("高精度モードで使う音声")}>
            <select
              value={s.ttsVoice}
              onChange={(e) => s.set("ttsVoice", e.target.value)}
              disabled={s.voiceEngine !== "server"}
              aria-label={t("読み上げの声")}
              className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[13px] outline-none disabled:opacity-50"
            >
              {TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Row>

          <Divider />
          <Row label={t("読み上げ速度")} sub={t("{n}倍速", { n: s.rate.toFixed(1) })}>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={s.rate}
              onChange={(e) => s.set("rate", Number(e.target.value))}
              aria-label={t("読み上げ速度")}
              className="h-11 w-32 accent-[var(--color-terracotta)]"
            />
          </Row>
        </div>
      </section>

      {/* Companion section */}
      <SectionTitle>{t("お散歩コンパニオン")}</SectionTitle>
      <section className="px-4">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]">
          <Row
            label={t("コンパニオンを表示")}
            sub={t("画面右下から、近くの史跡について雑談できます")}
            icon={<SparkIcon size={16} className="text-[var(--color-green)]" />}
          >
            <Toggle
              on={s.companionOn}
              label={t("コンパニオンを表示")}
              onClick={() => s.toggle("companionOn")}
            />
          </Row>
          <Divider />
          <Row label={t("ハンズフリー会話")} sub={t("話し終わると自動で聞き取りを続けます")}>
            <Toggle
              on={s.companionAutoListen}
              label={t("ハンズフリー会話")}
              onClick={() => s.toggle("companionAutoListen")}
            />
          </Row>
        </div>
      </section>

      {/* About / data source */}
      <SectionTitle>{t("このアプリについて")}</SectionTitle>
      <section className="px-4">
        <button
          type="button"
          onClick={replayOnboarding}
          className="mb-3 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-left text-[13px] font-bold active:scale-[0.99]"
        >
          {t("使い方をもう一度見る")}
          <span className="mt-0.5 block text-[12px] font-normal text-[var(--color-ink-soft)]">{t("はじめての3ステップを表示します")}</span>
        </button>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5 text-[var(--color-ink-soft)]">
              <InfoIcon size={18} />
            </span>
            <div className="text-[12px] leading-relaxed text-[var(--color-ink-soft)]">
              <p className="font-bold text-[var(--color-ink)]">{t("よりみっけ")}</p>
              <p className="mt-0.5">{t("知らなかった街の魅力を、旅の途中で見つけよう。")}</p>
              <p className="mt-1">
                {t(
                  "{areas}の指定文化財{total}件（国指定{kuni}件・県指定{ken}件）のうち、音声ガイド対応の{spots}スポットを収録しています。",
                  {
                    areas: AREAS.join("・"),
                    total: STATS.kunishitei + STATS.kenshitei,
                    kuni: STATS.kunishitei,
                    ken: STATS.kenshitei,
                    spots: SPOTS.length,
                  },
                )}
              </p>
              <p className="mt-2">{t("位置情報は住所をもとに国土地理院ジオコーディングで取得。AIガイドの 回答は各スポットの資料にもとづいて生成され、出典を明記します。")}</p>
              {/*
                出典は資料そのものなので、訳さずに原文（日本語）を残す。
                ただし日本語以外で読んでいる人には長い日本語の塊でしかないので、
                要約だけを訳して出し、原文は開いたときに見せる。
              */}
              <p className="mt-2 text-[12px]">
                {t("出典")}:{" "}
                {t("各市の公式文化財一覧、文化庁の指定文化財データベース、自治体サイトなどをもとに選定し、座標は国土地理院の住所検索で照合しています。")}
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-[12px] font-bold text-[var(--color-ink-soft)]">
                  {t("出典の原文（日本語）")}
                </summary>
                <p lang="ja" className="mt-1 text-[12px] leading-relaxed">
                  {DATA_SOURCE}
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** 見出し。文字列で渡されたものは、そのまま訳を引く（訳が無ければ日本語のまま）。 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <h2 className="px-5 pb-2 pt-6 text-[12px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
      {typeof children === "string" ? t(children) : children}
    </h2>
  );
}

function Row({
  label,
  sub,
  icon,
  children,
}: {
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {icon && <span aria-hidden="true">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{t(label)}</p>
        {sub && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">
            {t(sub)}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-[var(--color-border)]" />;
}

/**
 * 設定画面の最上部のアカウント欄。
 * ログインは任意なので、していない状態でも「困っている」見え方にはしない。
 */
function AccountCard() {
  const t = useT();
  const auth = useAuth();
  const profile = useProfile();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const big = "flex min-h-12 items-center justify-center rounded-xl text-[15px] font-extrabold transition active:scale-[0.99]";

  // ニックネームはログインした人だけの機能。付けていればそれを、
  // まだなら登録した表示名を出す。ログインしていない人は「ゲスト」のまま。
  const signedIn = auth.status === "signedIn" && auth.user;
  const shown = (signedIn ? profile.nickname || auth.user!.name : "") || t("ゲスト");

  const save = () => {
    profile.setNickname(draft);
    // サーバー側にも残す。投稿の表示名に使うため。失敗しても端末の名前は変わる。
    if (signedIn) saveNickname(draft).catch(() => {});
    setEditing(false);
    toast(draft.trim() ? `ニックネームを「${draft.trim().slice(0, 30)}」にしました` : "ニックネームを消しました");
  };

  return (
    <section className="px-4 pb-3" aria-labelledby="account-title">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta-soft)] text-[18px] font-extrabold text-[var(--color-terracotta)]"
          >
            {shown.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p id="account-title" className="truncate text-[15px] font-extrabold">
              {shown}
            </p>
            <p className="truncate text-[12px] text-[var(--color-ink-soft)]">
              {signedIn
                ? auth.user!.email
                : auth.status === "loading"
                  ? t("ログイン状態を確認しています…")
                  : t("ログインしていません（この端末にだけ保存）")}
            </p>
          </div>
          {signedIn && (
            <button
              type="button"
              onClick={async () => {
                await auth.signOut();
                toast(t("ログアウトしました"));
              }}
              className="flex min-h-11 shrink-0 items-center rounded-xl border border-[var(--color-border)] px-3 text-[13px] font-bold"
            >{t("ログアウト")}</button>
          )}
        </div>

        {/* ニックネーム。ログインした人だけ。いまは端末に保存し、
            ログイン機能をサーバーにつないだ時点でアカウントへ移す。 */}
        {signedIn && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(profile.nickname);
              setEditing(true);
            }}
            className="mt-3 min-h-11 w-full rounded-xl border border-[var(--color-border)] text-[13px] font-bold"
          >
            {profile.nickname ? t("ニックネームを変える") : t("ニックネームを付ける")}
          </button>
        )}
        {editing && signedIn && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              maxLength={30}
              autoFocus
              placeholder={t("例：たびびと")}
              aria-label={t("ニックネーム")}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 text-[16px] outline-none focus:border-[var(--color-terracotta)]"
            />
            <button
              type="button"
              onClick={save}
              className="min-h-12 shrink-0 rounded-xl bg-[var(--color-terracotta)] px-4 text-[14px] font-bold text-white"
            >{t("保存")}</button>
          </div>
        )}

        {!signedIn && auth.status !== "loading" && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => auth.openAuth("signUp")}
                className={`${big} bg-[var(--color-terracotta)] text-white`}
              >{t("新規登録")}</button>
              <button
                type="button"
                onClick={() => auth.openAuth("signIn")}
                className={`${big} border-2 border-[var(--color-terracotta)] text-[var(--color-terracotta)]`}
              >{t("ログイン")}</button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-soft)]">{t("ログインしなくても、すべての機能を使えます。")}</p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * 訪れた記録の見本。
 *
 * 本物の記録は「40m以内まで近づくと自動で付く」ので、会場で触っただけの人には
 * 0か所のままになる。何がたまるのかを先に見せておく。
 * 日付はきょうから数えて作る（固定の日付だと、見るたびに古くなる）。
 */
function VisitedSample() {
  const t = useT();
  if (!SHOW_SAMPLES) return null;
  const spots = SAMPLE_VISITED_IDS.map((id) => getSpot(id)).filter(
    (s): s is NonNullable<ReturnType<typeof getSpot>> => Boolean(s),
  );
  if (spots.length === 0) return null;
  const now = new Date();
  return (
    <div
      aria-hidden="true"
      className="mt-2 rounded-2xl border border-dashed border-[var(--color-terracotta)] bg-[var(--color-panel)] p-4"
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[15px] font-bold">{t("これまでに{n}か所", { n: spots.length })}</p>
        <span className="rounded-md bg-[var(--color-terracotta-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-terracotta)]">
          {t("見本")}
        </span>
      </div>
      <ul className="mt-2 divide-y divide-[var(--color-border)]">
        {spots.map((spot, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - (SAMPLE_VISITED_DAYS_AGO[i] ?? 0));
          return (
            <li key={spot.id} className="flex items-center gap-2.5 py-2">
              <span className="text-xl leading-none">{spot.icon}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{spot.name}</span>
              <span className="shrink-0 text-[12px] text-[var(--color-ink-soft)]">
                {t("{m}月{d}日", { m: d.getMonth() + 1, d: d.getDate() })}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11.5px] leading-5 text-[var(--color-ink-soft)]">{t("上は見本です。案内中に近づいた場所が、ここにたまっていきます。")}</p>
    </div>
  );
}

/**
 * 歩いた距離。ログインしている人にはグラフを、していない人には
 * 「ログインするとこれが使える」という案内を出す。
 *
 * 鍵をかけた機能をただ隠すと、そこに何があるのか分からないまま終わる。
 * 何が記録されるのかを先に見せて、そのうえで選んでもらう。
 */
function JourneySection() {
  const t = useT();
  const auth = useAuth();
  if (auth.status === "signedIn") {
    return (
      <>
        <JourneyCard />
        <JourneyClear />
      </>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      {/*
        作りものの記録を先に見せる。
        ここを「0m」が3つ並ぶだけの画面にすると、何が記録されるのか分からない
        まま終わってしまう。中身を見てから、ログインするかどうかを決められる
        ようにする。見本であることは札と破線の枠ではっきりさせる。
      */}
      {SHOW_SAMPLES && (
        <>
          <JourneyCard sample />
          <p className="mt-2 text-[11.5px] leading-5 text-[var(--color-ink-soft)]">{t("上は見本です。ログインすると、ここにあなたが歩いた距離が入ります。")}</p>
        </>
      )}

      <p className="mt-4 text-[15px] font-extrabold">{t("ログインすると使えます")}</p>
      <p className="mt-1 text-[12.5px] leading-6 text-[var(--color-ink-soft)]">{t("歩いた距離を、きょう・7日間・今月のカレンダーで見られます。ニックネームも ログインした人だけの機能です。ログインしないまま使う分には、何も記録しません。")}</p>
      {auth.status !== "loading" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => auth.openAuth("signUp")}
            className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-terracotta)] text-[15px] font-extrabold text-white"
          >{t("新規登録")}</button>
          <button
            type="button"
            onClick={() => auth.openAuth("signIn")}
            className="flex min-h-12 items-center justify-center rounded-xl border-2 border-[var(--color-terracotta)] text-[15px] font-extrabold text-[var(--color-terracotta)]"
          >{t("ログイン")}</button>
        </div>
      )}
    </div>
  );
}

/** 歩いた距離を消すボタン。記録は端末にしかないので、消す手段も同じ場所に置く。 */
function JourneyClear() {
  const t = useT();
  const journey = useJourney();
  if (journey.totalMeters <= 0) return null;
  return (
    <button
      type="button"
      onClick={() => journey.clearJourney()}
      className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] text-[13px] font-bold text-[var(--color-ink-soft)]"
    >{t("歩いた距離の記録を消す")}</button>
  );
}

/**
 * 投稿まわりの設定。ログインしている人にだけ出す。
 * 「どの立場で投稿するか」と「送ったものの一覧」を並べて置く。
 */
function PostSection() {
  const t = useT();
  const auth = useAuth();
  if (auth.status !== "signedIn") return null;
  return (
    <>
      <SectionTitle>{t("投稿")}</SectionTitle>
      <section className="space-y-2 px-4">
        <ContributorCard />
        <FeedbackCard />
        <MyPostsCard />
      </section>
    </>
  );
}

/**
 * アプリそのものへの意見を送るところ。
 *
 * スポットへの口コミと混ざらないよう、投稿の種類を分けて保存する（kind=feedback）。
 * 「使いにくい」と言ってもらえる場所が無いと、作った側には何も届かない。
 */
function FeedbackCard() {
  const post = usePost();
  const t = useT();
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <p className="text-[15px] font-extrabold">{t("このアプリへの意見")}</p>
      <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-ink-soft)]">
        {t("使いにくいところ、ほしい機能、うまく動かないところを教えてください。作った人に届きます。")}
      </p>
      <button
        type="button"
        onClick={() => post.openPost({ kind: "feedback" })}
        className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-[var(--color-terracotta)] text-[15px] font-extrabold text-[var(--color-terracotta)]"
      >
        {t("意見を送る")}
      </button>
    </div>
  );
}
