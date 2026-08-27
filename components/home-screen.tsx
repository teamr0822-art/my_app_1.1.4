"use client";

import type { Nav } from "@/app/page";
import {
  SPOTS,
  STATS,
  DATA_SOURCE,
  formatDistance,
  distanceMeters,
} from "@/lib/spots";
import { useGeolocation } from "@/lib/use-geolocation";
import { ChevronLeftIcon, MicIcon, SparkIcon } from "@/components/icons";

export function HomeScreen({ nav }: { nav: Nav }) {
  const { pos, located } = useGeolocation();

  const spots = [...SPOTS]
    .map((s) => ({ ...s, meters: distanceMeters(pos, [s.lat, s.lng]) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 5);

  const nearest = spots[0];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto pb-[calc(96px+env(safe-area-inset-bottom))]">
      {/* Header */}
      <header className="bg-[var(--color-terracotta)] px-5 pb-6 pt-[calc(20px+env(safe-area-inset-top))] text-white">
        <h1 className="text-[28px] font-extrabold tracking-tight">よりみっけ</h1>
        <p className="mt-1.5 text-[13px] font-medium leading-relaxed opacity-95 text-pretty">
          知らなかった街の魅力を、旅の途中で見つけよう。
        </p>
        <p className="mt-2 text-[12px] leading-relaxed opacity-85 text-pretty">
          気になった場所に話しかけると、その土地の物語が返ってきます。
        </p>

        {/* Stat banner: the unit goes with the number, so "48" is never a
            bare figure the reader has to decode. */}
        <div className="mt-4 flex gap-2">
          <Stat value={STATS.kunishitei} unit="件" label="国の指定文化財" />
          <Stat value={STATS.kenshitei} unit="件" label="県の指定文化財" />
          <Stat value={SPOTS.length} unit="か所" label="話しかけられる" />
        </div>
      </header>

      {/* The two things you can do, stated plainly and placed first. */}
      <section className="px-5 pt-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => nearest && nav.openSpot(nearest.id)}
            className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3.5 text-left transition active:scale-[0.99]"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)]"
            >
              <MicIcon size={20} />
            </span>
            <span className="block text-[14px] font-extrabold">話しかけてみる</span>
            <span className="block text-[11px] leading-4 text-[var(--color-ink-soft)]">
              {nearest ? `いちばん近い${nearest.name}から` : "近くの場所から"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => nav.go("route")}
            className="flex flex-col items-start gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3.5 text-left transition active:scale-[0.99]"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-green-soft)] text-[var(--color-green)]"
            >
              <SparkIcon size={20} />
            </span>
            <span className="block text-[14px] font-extrabold">寄り道をつくる</span>
            <span className="block text-[11px] leading-4 text-[var(--color-ink-soft)]">
              時間と気分から道すじを提案
            </span>
          </button>
        </div>
      </section>

      {/* Spots list */}
      <section className="px-5 pt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold">近くの寄り道さき</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
              タップすると、その場所の話を聞けます
            </p>
          </div>
          <span className="text-[11px] font-medium text-[var(--color-ink-soft)]">
            {located ? "現在地から近い順" : "高知城周辺"}
          </span>
        </div>

        <ul className="flex flex-col gap-3">
          {spots.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => nav.openSpot(s.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-left transition active:scale-[0.99]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-panel-soft)] text-3xl"
                >
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">
                    {s.name}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-[var(--color-terracotta-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-terracotta)]">
                      {s.designation}
                    </span>
                    <span className="text-[11px] text-[var(--color-ink-soft)]">
                      {s.category}・{formatDistance(s.meters)}
                    </span>
                  </span>
                </span>
                <ChevronLeftIcon
                  size={18}
                  className="shrink-0 rotate-180 text-[var(--color-ink-soft)]"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-5 px-5 text-[10.5px] leading-relaxed text-[var(--color-ink-soft)]">
        {DATA_SOURCE}
      </p>
    </div>
  );
}

function Stat({
  value,
  unit,
  label,
}: {
  value: number;
  unit: string;
  label: string;
}) {
  return (
    <div className="flex-1 rounded-xl bg-white/15 px-2.5 py-2 text-center">
      <div className="text-[10px] font-medium opacity-90">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold leading-none">
        {value}
        <span className="ml-0.5 text-[10px] font-bold opacity-90">{unit}</span>
      </div>
    </div>
  );
}
