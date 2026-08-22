"use client";

import { useSettings } from "@/lib/settings-context";
import { STATS, DATA_SOURCE, SPOTS } from "@/lib/spots";
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        on
          ? danger
            ? "bg-[var(--color-mute-accent)]"
            : "bg-[var(--color-green)]"
          : "bg-[var(--color-border)]"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export function SettingsScreen() {
  const s = useSettings();

  return (
    <div
      className={`flex flex-1 flex-col overflow-y-auto pb-[calc(96px+env(safe-area-inset-bottom))] ${
        s.muted ? "bg-[var(--color-mute-bg)]" : "bg-[var(--color-bg)]"
      }`}
    >
      <header className="px-5 pb-4 pt-[calc(20px+env(safe-area-inset-top))]">
        <h1 className="text-[22px] font-extrabold tracking-tight">設定</h1>
        <p className="mt-1 text-[12px] text-[var(--color-ink-soft)]">
          音声ガイドの動作をカスタマイズできます
        </p>
      </header>

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
              ミュートモード{" "}
              <span
                className={
                  s.muted ? "text-[var(--color-mute-ink)]" : "text-[var(--color-ink-soft)]"
                }
              >
                {s.muted ? "ON" : "OFF"}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">
              音声の入出力を止め、文字だけでご案内します。周囲に配慮したい場所で。
            </p>
          </div>
          <Toggle
            on={s.muted}
            danger
            label="ミュートモード"
            onClick={() => s.toggle("muted")}
          />
        </div>
      </section>

      {/* Voice section */}
      <SectionTitle>音声エンジン</SectionTitle>
      <section className="px-4">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]">
          <Row
            label="音声の方式"
            sub="サーバー音声が使えない時は自動で端末音声に切り替わります"
          >
            <div className="flex gap-1 rounded-full bg-[var(--color-panel-soft)] p-1">
              {(["server", "browser"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => s.set("voiceEngine", e)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                    s.voiceEngine === e
                      ? "bg-[var(--color-terracotta)] text-white"
                      : "text-[var(--color-ink-soft)]"
                  }`}
                >
                  {e === "server" ? "高精度" : "端末内蔵"}
                </button>
              ))}
            </div>
          </Row>

          <Divider />
          <Row label="読み上げの声" sub="高精度モードで使う音声">
            <select
              value={s.ttsVoice}
              onChange={(e) => s.set("ttsVoice", e.target.value)}
              disabled={s.voiceEngine !== "server"}
              aria-label="読み上げの声"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[13px] outline-none disabled:opacity-50"
            >
              {TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Row>

          <Divider />
          <Row label="読み上げ速度" sub={`${s.rate.toFixed(1)}倍速`}>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={s.rate}
              onChange={(e) => s.set("rate", Number(e.target.value))}
              aria-label="読み上げ速度"
              className="w-32 accent-[var(--color-terracotta)]"
            />
          </Row>
        </div>
      </section>

      {/* Companion section */}
      <SectionTitle>お散歩コンパニオン</SectionTitle>
      <section className="px-4">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]">
          <Row
            label="コンパニオンを表示"
            sub="画面右下から、近くの史跡について雑談できます"
            icon={<SparkIcon size={16} className="text-[var(--color-green)]" />}
          >
            <Toggle
              on={s.companionOn}
              label="コンパニオンを表示"
              onClick={() => s.toggle("companionOn")}
            />
          </Row>
          <Divider />
          <Row label="ハンズフリー会話" sub="話し終わると自動で聞き取りを続けます">
            <Toggle
              on={s.companionAutoListen}
              label="ハンズフリー会話"
              onClick={() => s.toggle("companionAutoListen")}
            />
          </Row>
        </div>
      </section>

      {/* About / data source */}
      <SectionTitle>このアプリについて</SectionTitle>
      <section className="px-4">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5 text-[var(--color-ink-soft)]">
              <InfoIcon size={18} />
            </span>
            <div className="text-[12px] leading-relaxed text-[var(--color-ink-soft)]">
              <p className="font-bold text-[var(--color-ink)]">話して発見</p>
              <p className="mt-1">
                高知市の指定文化財{STATS.kunishitei + STATS.kenshitei}件（国指定
                {STATS.kunishitei}件・県指定{STATS.kenshitei}件）のうち、
                音声ガイド対応の{SPOTS.length}スポットを収録しています。
              </p>
              <p className="mt-2">
                位置情報は住所をもとに国土地理院ジオコーディングで取得。AIガイドの
                回答は各スポットの資料にもとづいて生成され、出典を明記します。
              </p>
              <p className="mt-2 text-[11px]">出典: {DATA_SOURCE}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-5 pb-2 pt-6 text-[12px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
      {children}
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
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {icon && <span aria-hidden="true">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{label}</p>
        {sub && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
            {sub}
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
