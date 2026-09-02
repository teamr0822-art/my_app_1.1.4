"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Nav } from "@/app/page";
import { SPOTS, areaOf, distanceMeters, formatDistance } from "@/lib/spots";
import { useGeolocation } from "@/lib/use-geolocation";
import { useGuideChat } from "@/lib/use-guide-chat";
import { stripMarkdown } from "@/lib/format";
import { SendIcon, SparkIcon } from "@/components/icons";

/**
 * Trip lengths, in minutes.
 *
 * Three choices (1時間 / 半日 / 1日) could not express what people actually
 * have: a gap between trains, "about an hour and a half", or a hard deadline.
 * The chips cover the common cases and the clock below them covers the rest.
 */
const DURATIONS: { label: string; minutes: number }[] = [
  { label: "30分", minutes: 30 },
  { label: "1時間", minutes: 60 },
  { label: "1時間半", minutes: 90 },
  { label: "2時間", minutes: 120 },
  { label: "半日", minutes: 240 },
  { label: "1日", minutes: 480 },
];

/**
 * How far someone can get from where they stand, per minute of trip time.
 *
 * This replaced a pair of lookup tables keyed by the old labels, which could
 * not answer "how far in 90 minutes". The 0.35 covers the walk back and the
 * time actually spent at each place — checked against the previous numbers, it
 * lands within a few hundred metres of them for every old option.
 */
const METRES_PER_MINUTE: Record<string, number> = {
  "徒歩": 80,
  "自転車": 250,
  "車": 500,
  "公共交通": 380,
};

const TRANSPORTS = Object.keys(METRES_PER_MINUTE);

function radiusFor(minutes: number, transport: string): number {
  const speed = METRES_PER_MINUTE[transport] ?? 80;
  return Math.min(30000, Math.max(500, minutes * speed * 0.35));
}

const MOODS = [
  "ゆったり",
  "たくさん歩きたい",
  "歴史を深掘り",
  "食べ歩き",
  "絶景・写真",
  "静かな場所",
];

/** "90" → "1時間30分" — used for the label the clock produces. */
function describeMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}時間${m}分`;
  if (h) return `${h}時間`;
  return `${m}分`;
}

/** Upper bound on candidates sent to the model (keeps the prompt small). */
const MAX_CANDIDATES = 25;
/** Never send fewer than this, even if nothing falls inside the radius. */
const MIN_CANDIDATES = 8;

const chip = "flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-4 text-sm transition hover:border-[var(--color-terracotta)]";

export function RouteScreen({ nav }: { nav: Nav }) {
  const [minutes, setMinutes] = useState(240);
  /** Set when the visitor is working to a deadline rather than a duration. */
  const [endTime, setEndTime] = useState("");
  const [useEndTime, setUseEndTime] = useState(false);
  const [transport, setTransport] = useState("徒歩");
  const [weather, setWeather] = useState("晴れ");
  const [moods, setMoods] = useState<string[]>(["ゆったり"]);
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState("");
  const geo = useGeolocation();

  /**
   * Minutes left until the chosen clock time. Recomputed on every render rather
   * than stored, so a form left open for ten minutes does not plan a trip that
   * is ten minutes too long.
   */
  const minutesUntilEnd = useMemo(() => {
    if (!useEndTime || !endTime) return null;
    const [h, m] = endTime.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const now = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 60000);
  }, [useEndTime, endTime]);

  /** A deadline already past is the one input that cannot be planned around. */
  const endTimeInvalid = useEndTime && (minutesUntilEnd === null || minutesUntilEnd < 10);
  const tripMinutes = useEndTime && minutesUntilEnd && minutesUntilEnd >= 10 ? minutesUntilEnd : minutes;
  const tripLabel = useEndTime && !endTimeInvalid ? `${endTime}まで（約${describeMinutes(tripMinutes)}）` : describeMinutes(tripMinutes);

  // Candidate spots near the user, closest first. Without this the model was
  // handed spots from every prefecture in the dataset and could propose a
  // "half-day walk" spanning Kochi, Hiroshima and Kagoshima.
  const candidates = useMemo(() => {
    const radius = radiusFor(tripMinutes, transport);
    const ranked = SPOTS.map((spot) => ({
      spot,
      d: distanceMeters(geo.pos, [spot.lat, spot.lng]),
    })).sort((a, b) => a.d - b.d);
    const within = ranked.filter((r) => r.d <= radius);
    // Fall back to the nearest few so the screen still works when the user is
    // far from every registered site (or geolocation is unavailable).
    const picked = within.length >= MIN_CANDIDATES ? within : ranked.slice(0, MIN_CANDIDATES);
    return picked.slice(0, MAX_CANDIDATES);
  }, [geo.pos, tripMinutes, transport]);

  const area = candidates[0]?.spot
    ? [candidates[0].spot.prefecture, candidates[0].spot.city].filter(Boolean).join("")
    : "";

  const nearby = useMemo(
    () =>
      candidates.map(({ spot, d }) => ({
        name: spot.name,
        grounding: `${spot.address}（現在地から約${formatDistance(d)}）`,
        city: areaOf(spot),
      })),
    [candidates],
  );

  const { messages, streaming, send } = useGuideChat({ mode: "route", nearby });
  const [error, setError] = useState<string | null>(null);
  const rawAnswer = messages.filter((m) => m.role === "assistant").at(-1)?.content;
  // The model still slips in Markdown now and then; the screen shows plain text.
  const answer = rawAnswer ? stripMarkdown(rawAnswer) : undefined;

  // Map the proposed route back to real spot ids by finding candidate names in
  // the answer, in the order the model listed them. Previously this button
  // always started the first five spots in the dataset, ignoring the proposal.
  const routeSpotIds = useMemo(() => {
    const pool = candidates.map(({ spot }) => spot);
    if (!answer) return pool.slice(0, 5).map((spot) => spot.id);
    const found = pool
      .map((spot) => ({ spot, at: answer.indexOf(spot.name) }))
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((hit) => hit.spot.id);
    return found.length ? found : pool.slice(0, 5).map((spot) => spot.id);
  }, [answer, candidates]);

  /**
   * The proposal lands below the form, past the fold: on a phone, tapping
   * "ルートを作成する" looked like nothing had happened. Bring the result into
   * view as soon as it starts arriving.
   */
  const resultRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!answer || !resultRef.current) return;
    // Only scroll once per proposal, so the visitor can scroll away while the
    // rest of the text is still streaming in.
    const key = answer.slice(0, 24);
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [answer]);

  const generate = async () => {
    const moodText = moods.length ? moods.join("・") : "おまかせ";
    const prompt = `観光ルートを作成してください。条件: 出発エリア=${area || "現在地周辺"}、使える時間=${tripLabel}、移動手段=${transport}、天気=${weather}、気分=${moodText}、追加要望=${request || "なし"}。候補スポットはすべて現在地の近くにあります。距離が離れすぎるスポットは無理に入れず、${tripLabel}で無理なく回りきれる範囲にまとめてください。移動時間だけでなく、各スポットでの見学時間も見込んでください。`;
    setError(null);
    try {
      await send(prompt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ルート作成に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[var(--tabbar-clearance)]">
      <header className="border-b border-[var(--color-border)] px-5 pb-5 pt-8">
        <p className="font-mono text-xs tracking-[0.22em] text-[var(--color-terracotta)]">よりみっけルート</p>
        <h1 className="mt-2 text-2xl font-bold text-balance">あなたに合う、今日の歩き方</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">気分が変わっても大丈夫。途中で条件を変えて、何度でも組み直せます。</p>
      </header>

      <div className="flex flex-col gap-5 p-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold">使える時間</legend>
          <div role="radiogroup" aria-label="使える時間" className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => {
              const on = !useEndTime && minutes === d.minutes;
              return (
                <button
                  key={d.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => {
                    setMinutes(d.minutes);
                    setUseEndTime(false);
                  }}
                  className={`${chip} ${on ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white" : "text-[var(--color-ink-soft)]"}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {/*
            The clock, for the case the chips cannot express: a train to catch,
            a museum that closes. It is a native time input, so the minute-level
            picker, the keyboard support and the screen-reader labels all come
            from the platform rather than from a control I would have to build.
          */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={useEndTime}
              onClick={() => {
                const next = !useEndTime;
                setUseEndTime(next);
                if (next && !endTime) {
                  const t = new Date(Date.now() + 2 * 60 * 60 * 1000);
                  setEndTime(
                    `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
                  );
                }
              }}
              className={`${chip} ${useEndTime ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white" : "text-[var(--color-ink-soft)]"}`}
            >
              終わりの時刻で決める
            </button>
            {useEndTime && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  aria-label="終わりの時刻"
                  className="min-h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-sm outline-none focus:border-[var(--color-terracotta)] focus:ring-2 focus:ring-[var(--color-terracotta)]/40"
                />
                まで
              </label>
            )}
          </div>
          <p aria-live="polite" className="text-[12px] text-[var(--color-ink-soft)]">
            {endTimeInvalid
              ? "いまより後の時刻を選んでください。"
              : `この条件でおよそ ${describeMinutes(tripMinutes)} の寄り道を組みます。`}
          </p>
        </fieldset>

        <Option label="移動手段" values={TRANSPORTS} value={transport} onChange={setTransport} />
        <Option label="天気" values={["晴れ", "くもり", "雨"]} value={weather} onChange={setWeather} />

        {/* Multi-select: "歴史を深掘り" and "食べ歩き" are not rival moods, and
            forcing one of them out made the answer worse than the visitor asked
            for. Nothing selected is a valid answer too — that means おまかせ. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold">
            いまの気分{" "}
            <span className="font-normal text-[var(--color-ink-soft)]">（いくつでも）</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => {
              const on = moods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setMoods((prev) => (on ? prev.filter((x) => x !== m) : [...prev, m]))
                  }
                  className={`${chip} ${on ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white" : "text-[var(--color-ink-soft)]"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-2 text-sm font-bold">
          追加の希望（任意）
          <textarea value={request} onChange={(e) => setRequest(e.target.value)} placeholder="例：混雑を避けたい、眺めの良い場所に行きたい" className="min-h-24 resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 font-normal outline-none placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-terracotta)]" />
        </label>

        <button type="button" onClick={() => { if (!streaming && !endTimeInvalid) generate(); }} aria-disabled={streaming || endTimeInvalid} className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-terracotta)] px-4 py-3 font-bold text-white aria-disabled:opacity-50">
          <SparkIcon size={18} /> {streaming ? "ルートを考えています…" : "ルートを作成する"}
        </button>

        {error && <div role="alert" className="rounded-2xl border border-red-300/40 bg-red-950/20 p-4 text-sm"><p>{error}</p><button type="button" onClick={generate} className="mt-3 rounded-xl border border-[var(--color-border)] px-3 py-2 font-bold">もう一度試す</button></div>}

        {answer && <div ref={resultRef} className="scroll-mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4"><p className="mb-2 text-xs font-bold tracking-wider text-[var(--color-terracotta)]">今日の寄り道プラン</p><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-7">{answer}</p><button type="button" onClick={() => nav.startRoute(routeSpotIds, transport)} className="mt-4 w-full rounded-xl bg-[var(--color-green)] px-4 py-3 text-sm font-bold text-white">このルートで案内をはじめる</button></div>}

        {messages.length > 0 && <div className="rounded-2xl border border-[var(--color-border)] p-4"><p className="mb-2 text-sm font-bold">途中で変更する</p><div className="flex gap-2"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); if (draft.trim()) { send(draft); setDraft(""); } } }} aria-label="ルートの変更内容" placeholder="例：短くして、別の場所に変えて" className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none" /><button type="button" aria-label="変更を送信" onClick={() => { if (draft.trim()) { send(draft); setDraft(""); } }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-green)] text-white"><SendIcon size={17} /></button></div></div>}
      </div>
    </section>
  );
}

/**
 * One row of choices. The selected chip was previously distinguished by colour
 * alone, which told a screen-reader user nothing; the group is now a real radio
 * group, so the current value is announced and the arrow keys move through it.
 */
function Option({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-bold">{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={value === item}
            tabIndex={value === item ? 0 : -1}
            onClick={() => onChange(item)}
            className={`${chip} ${value === item ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white" : "text-[var(--color-ink-soft)]"}`}
          >
            {item}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
