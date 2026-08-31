"use client";

import type { Nav, Screen } from "@/app/page";
import { HomeIcon, MapIcon, SettingsIcon, SparkIcon } from "@/components/icons";

/**
 * The tab bar, described as data.
 *
 * Each tab used to be a hand-written block plus its own `isX` boolean, so
 * adding or reordering one meant editing several places in step and re-tuning
 * the spacing by hand. Listing them here means a new tab is one entry, and the
 * centre map button stays the one deliberate exception — it is raised above the
 * bar because it is the screen people return to most.
 */
const TABS: { screen: Screen; label: string; icon: React.ReactNode; raised?: boolean }[] = [
  { screen: "home", label: "ホーム", icon: <HomeIcon size={22} /> },
  { screen: "route", label: "ルート", icon: <SparkIcon size={22} /> },
  { screen: "map", label: "マップ", icon: <MapIcon size={26} />, raised: true },
  { screen: "settings", label: "設定", icon: <SettingsIcon size={22} /> },
];

export function BottomNav({ nav }: { nav: Nav }) {
  return (
    <nav
      aria-label="メインナビゲーション"
      className="app-tabbar z-[600] flex items-end justify-around border-t border-[var(--color-border)] bg-[var(--color-panel)]/95 px-4 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      {TABS.map((tab) => (
        <NavButton
          key={tab.screen}
          active={nav.screen === tab.screen}
          label={tab.label}
          icon={tab.icon}
          raised={tab.raised}
          onClick={() => nav.go(tab.screen)}
        />
      ))}
    </nav>
  );
}

function NavButton({
  active,
  label,
  onClick,
  icon,
  raised = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  raised?: boolean;
}) {
  if (raised) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className="relative -mt-6 flex min-w-16 flex-col items-center gap-1"
      >
        <span
          aria-hidden="true"
          /* The app's one warm point: a firework red at rest, turning the same
             sky blue as every other active control once you are on the map. */
          className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-[var(--color-panel)] text-white shadow-lg transition ${
            active ? "bg-[var(--color-terracotta)]" : "bg-[var(--color-sunset-ink)]"
          }`}
        >
          {icon}
        </span>
        <span
          className={`text-[12px] font-bold ${
            active ? "text-[var(--color-terracotta)]" : "text-[var(--color-ink-soft)]"
          }`}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 min-w-16 flex-col items-center gap-1 py-1 text-[12px] font-bold transition ${
        active ? "text-[var(--color-terracotta)]" : "text-[var(--color-ink-soft)]"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
