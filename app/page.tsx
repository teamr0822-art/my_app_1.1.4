"use client";

import { useEffect, useRef, useState } from "react";
import { SettingsProvider } from "@/lib/settings-context";
import { LocationProvider } from "@/lib/location-context";
import { ToastProvider } from "@/lib/toast-context";
import { AuthProvider } from "@/lib/auth-context";
import { AuthSheet } from "@/components/auth-sheet";
import { HomeScreen } from "@/components/home-screen";
import { MapScreen } from "@/components/map-screen";
import { SettingsScreen } from "@/components/settings-screen";
import { SpotScreen } from "@/components/spot-screen";
import { BottomNav } from "@/components/bottom-nav";
import { RouteScreen } from "@/components/route-screen";
import { CompanionLayer } from "@/components/companion-layer";
import { Onboarding } from "@/components/onboarding";
import { ErrorBoundary } from "@/components/error-boundary";

export type Screen = "home" | "map" | "route" | "settings" | "spot";

const SCREEN_LABEL: Record<Screen, string> = {
  home: "ホーム",
  map: "地図",
  route: "ルート作成",
  settings: "設定",
  spot: "スポット案内",
};

export type Nav = {
  screen: Screen;
  spotId: string | null;
  go: (screen: Screen) => void;
  openSpot: (id: string) => void;
  /** スポットを開く前にいた画面。「戻る」でそこへ帰るために覚えている。 */
  spotFrom: Screen;
  startRoute: (ids: string[], transport?: string) => void;
  routeIds: string[];
  routeTransport: string;
  /** 何番目の区間まで来たか。案内を再開するために保存している。 */
  routeLeg: number;
  setRouteLeg: (leg: number) => void;
  /** 案内をやめて、保存も消す。 */
  endRoute: () => void;
};

/**
 * 作ったルートは端末に残す。
 *
 * 実際の使い方は「朝に作って、昼過ぎまで何度も見返す」なので、リロードや
 * アプリの切り替えで消えるのは実用にならない。進み具合（何番目の区間か）も
 * 一緒に保存して、開き直したら続きから案内できるようにする。
 */
const ROUTE_KEY = "yorimikke-route-v1";
/** 一日の寄り道が対象。前日のルートを黙って復元はしない。 */
const ROUTE_TTL_MS = 18 * 60 * 60 * 1000;

type SavedRoute = { ids: string[]; transport: string; leg: number; savedAt: number };

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [spotFrom, setSpotFrom] = useState<Screen>("home");
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [routeTransport, setRouteTransport] = useState("徒歩");
  const [routeLeg, setRouteLeg] = useState(0);
  /** 復元が終わるまでは保存しない（空の状態で上書きしてしまうため）。 */
  const restored = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ROUTE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedRoute;
        if (
          Array.isArray(saved.ids) &&
          saved.ids.length > 0 &&
          Date.now() - (saved.savedAt ?? 0) < ROUTE_TTL_MS
        ) {
          setRouteIds(saved.ids);
          setRouteTransport(saved.transport || "徒歩");
          setRouteLeg(Number.isFinite(saved.leg) ? saved.leg : 0);
        } else if (saved) {
          window.localStorage.removeItem(ROUTE_KEY);
        }
      }
    } catch {
      /* 壊れた保存データは無視して、ふつうに起動する */
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      if (routeIds.length === 0) {
        window.localStorage.removeItem(ROUTE_KEY);
        return;
      }
      const saved: SavedRoute = {
        ids: routeIds,
        transport: routeTransport,
        leg: routeLeg,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(ROUTE_KEY, JSON.stringify(saved));
    } catch {
      /* 保存できなくても案内そのものは続く */
    }
  }, [routeIds, routeTransport, routeLeg]);

  const nav: Nav = {
    screen,
    spotId,
    go: (s) => {
      setScreen(s);
    },
    spotFrom,
    openSpot: (id) => {
      // 地図から開いたなら地図へ、一覧から開いたなら一覧へ帰す。歩きながら
      // 「地図 → スポット → 地図」を往復するので、毎回ホームに落ちるのは面倒。
      if (screen !== "spot") setSpotFrom(screen);
      setSpotId(id);
      setScreen("spot");
    },
    routeIds,
    routeTransport,
    routeLeg,
    setRouteLeg,
    startRoute: (ids, transport) => {
      setRouteIds(ids);
      if (transport) setRouteTransport(transport);
      setRouteLeg(0);
      setScreen("map");
    },
    endRoute: () => {
      setRouteIds([]);
      setRouteLeg(0);
    },
  };

  const showBottomNav = screen !== "spot";

  return (
    <SettingsProvider>
      <LocationProvider>
      <ToastProvider>
      <AuthProvider>
        <main className="app-frame">
          {/* One boundary per screen visit: if the map throws, the tab bar
              still works and moving to another tab clears the error, instead
              of the whole app going blank. */}
          <ErrorBoundary key={screen} label={SCREEN_LABEL[screen]} onReset={() => setScreen("home")}>
            {screen === "home" && <HomeScreen nav={nav} />}
            {screen === "map" && (
              <MapScreen nav={nav} routeIds={routeIds} routeTransport={routeTransport} />
            )}
            {screen === "settings" && <SettingsScreen />}
            {screen === "spot" && spotId && <SpotScreen spotId={spotId} nav={nav} />}
          </ErrorBoundary>

          {/*
            Outside the boundary above, and never unmounted: that boundary is
            keyed on the screen, so anything inside it is rebuilt from scratch
            on every tab change. The route plan has to outlive that — you start
            walking, then decide you want it the other way round.
          */}
          <ErrorBoundary label={SCREEN_LABEL.route} onReset={() => setScreen("home")}>
            <RouteScreen nav={nav} hidden={screen !== "route"} />
          </ErrorBoundary>

          {showBottomNav && <BottomNav nav={nav} />}
          <Onboarding />
          {/* ログイン／新規登録。はじめての案内と設定画面の両方から開く。 */}
          <AuthSheet />

          <ErrorBoundary label="コンパニオン">
            <CompanionLayer nav={nav} bottomNavVisible={showBottomNav} />
          </ErrorBoundary>
        </main>
      </AuthProvider>
      </ToastProvider>
      </LocationProvider>
    </SettingsProvider>
  );
}
