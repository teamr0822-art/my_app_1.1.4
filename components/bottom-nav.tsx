"use client";

import type { Nav } from "@/app/page";
import { HomeIcon, MapIcon, SettingsIcon, SparkIcon } from "@/components/icons";

export function BottomNav({ nav }: { nav: Nav }) {
  const isHome = nav.screen === "home";
  const isMap = nav.screen === "map";
  const isRoute = nav.screen === "route";
  const isSettings = nav.screen === "settings";

  return (
    <nav
      aria-label="メインナビゲーション"
      className="absolute inset-x-0 bottom-0 z-[600] flex items-end justify-around border-t border-[var(--color-border)] bg-[var(--color-panel)]/95 px-6 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <NavButton
        active={isHome}
        label="ホーム"
        onClick={() => nav.go("home")}
        icon={<HomeIcon size={22} />}
      />

      <NavButton active={isRoute} label="ルート" onClick={() => nav.go("route")} icon={<SparkIcon size={22} />} />

      {/* Elevated center map button */}
      <button
        type="button"
        onClick={() => nav.go("map")}
        aria-label="マップ"
        aria-current={isMap ? "page" : undefined}
        className="relative -mt-6 flex flex-col items-center gap-1"
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-[var(--color-panel)] shadow-lg transition ${
            isMap
              ? "bg-[var(--color-terracotta)] text-white"
              : "bg-[var(--color-green)] text-white"
          }`}
        >
          <MapIcon size={26} />
        </span>
        <span
          className={`text-[11px] font-bold ${
            isMap ? "text-[var(--color-terracotta)]" : "text-[var(--color-ink-soft)]"
          }`}
        >
          マップ
        </span>
      </button>

      <NavButton
        active={isSettings}
        label="設定"
        onClick={() => nav.go("settings")}
        icon={<SettingsIcon size={22} />}
      />
    </nav>
  );
}

function NavButton({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[11px] font-bold transition ${
        active ? "text-[var(--color-terracotta)]" : "text-[var(--color-ink-soft)]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
