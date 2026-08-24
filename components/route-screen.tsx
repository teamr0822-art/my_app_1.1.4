"use client";

import { useMemo, useState } from "react";
import type { Nav } from "@/app/page";
import { SPOTS, distanceMeters, formatDistance } from "@/lib/spots";
import { useGeolocation } from "@/lib/use-geolocation";
import { useGuideChat } from "@/lib/use-guide-chat";
import { SendIcon, SparkIcon } from "@/components/icons";

/**
 * How far we are willing to look for candidate spots, in metres, by the
 * selected trip length. Multiplied by the transport factor below.
 */
const RADIUS_BY_DISTANCE: Record<string, number> = {
  "1時間": 2000,
  "半日": 6000,
  "1日": 15000,
};

const RADIUS_BY_TRANSPORT: Record<string, number> = {
  "徒歩": 1,
  "自転車": 2.5,
  "公共交通": 4,
};

/** Upper bound on candidates sent to the model (keeps the prompt small). */
const MAX_CANDIDATES = 25;
/** Never send fewer than this, even if nothing falls inside the radius. */
const MIN_CANDIDATES = 8;

const chip = "rounded-full border border-[var(--color-border)] px-3 py-2 text-sm transition hover:border-[var(--color-terracotta)]";

export function RouteScreen({ nav }: { nav: Nav }) {
  const [distance, setDistance] = useState("半日");
  const [transport, setTransport] = useState("徒歩");
  const [weather, setWeather] = useState("晴れ");
  const [mood, setMood] = useState("ゆったり");
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState("");
  const geo = useGeolocation();

  // Candidate spots near the user, closest first. Without this the model was
  // handed spots from every prefecture in the dataset and could propose a
  // "half-day walk" spanning Kochi, Hiroshima and Kagoshima.
  const candidates = useMemo(() => {
    const radius =
      (RADIUS_BY_DISTANCE[distance] ?? 6000) * (RADIUS_BY_TRANSPORT[transport] ?? 1);
    const ranked = SPOTS.map((spot) => ({
      spot,
      d: distanceMeters(geo.pos, [spot.lat, spot.lng]),
    })).sort((a, b) => a.d - b.d);
    const within = ranked.filter((r) => r.d <= radius);
    // Fall back to the nearest few so the screen still works when the user is
    // far from every registered site (or geolocation is unavailable).
    const picked = within.length >= MIN_CANDIDATES ? within : ranked.slice(0, MIN_CANDIDATES);
    return picked.slice(0, MAX_CANDIDATES);
  }, [geo.pos, distance, transport]);

  const area = candidates[0]?.spot
    ? [candidates[0].spot.prefecture, candidates[0].spot.city].filter(Boolean).join("")
    : "";

  const nearby = useMemo(
    () =>
      candidates.map(({ spot, d }) => ({
        name: spot.name,
        grounding: `${spot.address}（現在地から約${formatDistance(d)}）`,
      })),
    [candidates],
  );

  const { messages, streaming, send } = useGuideChat({ mode: "route", nearby });
  const [error, setError] = useState<string | null>(null);
  const answer = messages.filter((m) => m.role === "assistant").at(-1)?.content;

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

  const generate = async () => {
    const prompt = `観光ルートを作成してください。条件: 出発エリア=${area || "現在地周辺"}、合計移動距離/時間=${distance}、移動手段=${transport}、天気=${weather}、気分=${mood}、追加要望=${request || "なし"}。候補スポットはすべて現在地の近くにあります。距離が離れすぎるスポットは無理に入れず、${distance}で回りきれる範囲にまとめてください。不明な条件があれば先に確認質問をしてください。`;
    setError(null);
    try {
      await send(prompt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ルート作成に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-24">
      <header className="border-b border-[var(--color-border)] px-5 pb-5 pt-8">
        <p className="font-mono text-xs tracking-[0.22em] text-[var(--color-terracotta)]">AI ROUTE GUIDE</p>
        <h1 className="mt-2 text-2xl font-bold text-balance">あなたに合う、今日の歩き方</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">気分が変わっても大丈夫。途中で条件を変えて、何度でも組み直せます。</p>
      </header>

      <div className="flex flex-col gap-5 p-5">
        <Option label="歩く時間・距離" values={["1時間", "半日", "1日"]} value={distance} onChange={setDistance} />
        <Option label="移動手段" values={["徒歩", "自転車", "公共交通"]} value={transport} onChange={setTransport} />
        <Option label="天気" values={["晴れ", "くもり", "雨"]} value={weather} onChange={setWeather} />
        <Option label="いまの気分" values={["ゆったり", "たくさん歩きたい", "歴史を深掘り", "食べ歩き"]} value={mood} onChange={setMood} />

        <label className="flex flex-col gap-2 text-sm font-bold">
          追加の希望（任意）
          <textarea value={request} onChange={(e) => setRequest(e.target.value)} placeholder="例：混雑を避けたい、眺めの良い場所に行きたい" className="min-h-24 resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 font-normal outline-none placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-terracotta)]" />
        </label>

        <button type="button" onClick={generate} disabled={streaming} className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-terracotta)] px-4 py-3 font-bold text-white disabled:opacity-50">
          <SparkIcon size={18} /> {streaming ? "ルートを考えています…" : "ルートを作成する"}
        </button>

        {error && <div role="alert" className="rounded-2xl border border-red-300/40 bg-red-950/20 p-4 text-sm"><p>{error}</p><button type="button" onClick={generate} className="mt-3 rounded-xl border border-[var(--color-border)] px-3 py-2 font-bold">もう一度試す</button></div>}

        {answer && <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4"><p className="mb-2 text-xs font-bold tracking-wider text-[var(--color-terracotta)]">AIからの提案</p><p className="whitespace-pre-wrap text-sm leading-7">{answer}</p><button type="button" onClick={() => nav.startRoute(routeSpotIds, transport)} className="mt-4 w-full rounded-xl bg-[var(--color-green)] px-4 py-3 text-sm font-bold text-white">このルートで案内をはじめる</button></div>}

        {messages.length > 0 && <div className="rounded-2xl border border-[var(--color-border)] p-4"><p className="mb-2 text-sm font-bold">途中で変更する</p><div className="flex gap-2"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); if (draft.trim()) { send(draft); setDraft(""); } } }} placeholder="例：短くして、別の場所に変えて" className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm outline-none" /><button type="button" aria-label="変更を送信" onClick={() => { if (draft.trim()) { send(draft); setDraft(""); } }} className="rounded-xl bg-[var(--color-green)] px-3 text-white"><SendIcon size={17} /></button></div></div>}
      </div>
    </section>
  );
}

function Option({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="flex flex-col gap-2"><legend className="text-sm font-bold">{label}</legend><div className="flex flex-wrap gap-2">{values.map((item) => <button key={item} type="button" onClick={() => onChange(item)} className={`${chip} ${value === item ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white" : "text-[var(--color-ink-soft)]"}`}>{item}</button>)}</div></fieldset>;
}
