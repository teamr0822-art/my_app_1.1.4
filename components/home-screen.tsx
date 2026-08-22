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
import { ChevronLeftIcon } from "@/components/icons";

export function HomeScreen({ nav }: { nav: Nav }) {
  const { pos, located } = useGeolocation();

  const spots = [...SPOTS]
    .map((s) => ({ ...s, meters: distanceMeters(pos, [s.lat, s.lng]) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 5);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto pb-28">
      {/* Header */}
      <header className="bg-[var(--color-terracotta)] px-5 pb-6 pt-[calc(20px+env(safe-area-inset-top))] text-white">
        <p className="text-[12px] font-medium opacity-90">高知市 史跡AI音声ガイド</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">話して発見</h1>
        <p className="mt-2 text-[13px] leading-relaxed opacity-95 text-pretty">
          気になる史跡に話しかけると、AIガイドが出典にもとづいて答えてくれます。
        </p>

        {/* Stat banner */}
        <div className="mt-4 flex gap-3">
          <Stat value={STATS.kunishitei} label="国指定" />
          <Stat value={STATS.kenshitei} label="県指定" />
          <Stat value={SPOTS.length} label="音声ガイド" />
        </div>
      </header>

      {/* Spots list */}
      <section className="px-5 pt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-extrabold">音声で体験できるスポット</h2>
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white/15 px-3 py-2 text-center">
      <div className="text-xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-medium opacity-90">{label}</div>
    </div>
  );
}
