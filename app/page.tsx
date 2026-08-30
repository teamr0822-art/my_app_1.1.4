"use client";

import { useState } from "react";
import { SettingsProvider } from "@/lib/settings-context";
import { ToastProvider } from "@/lib/toast-context";
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
  startRoute: (ids: string[], transport?: string) => void;
  routeIds: string[];
  routeTransport: string;
};

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [routeTransport, setRouteTransport] = useState("徒歩");

  const nav: Nav = {
    screen,
    spotId,
    go: (s) => {
      setScreen(s);
    },
    openSpot: (id) => {
      setSpotId(id);
      setScreen("spot");
    },
    routeIds,
    routeTransport,
    startRoute: (ids, transport) => {
      setRouteIds(ids);
      if (transport) setRouteTransport(transport);
      setScreen("map");
    },
  };

  const showBottomNav = screen !== "spot";

  return (
    <SettingsProvider>
      <ToastProvider>
        <main className="app-frame">
          {/* One boundary per screen visit: if the map throws, the tab bar
              still works and moving to another tab clears the error, instead
              of the whole app going blank. */}
          <ErrorBoundary key={screen} label={SCREEN_LABEL[screen]} onReset={() => setScreen("home")}>
            {screen === "home" && <HomeScreen nav={nav} />}
            {screen === "map" && (
              <MapScreen nav={nav} routeIds={routeIds} routeTransport={routeTransport} />
            )}
            {screen === "route" && <RouteScreen nav={nav} />}
            {screen === "settings" && <SettingsScreen />}
            {screen === "spot" && spotId && <SpotScreen spotId={spotId} nav={nav} />}
          </ErrorBoundary>

          {showBottomNav && <BottomNav nav={nav} />}
          <Onboarding />

          <ErrorBoundary label="コンパニオン">
            <CompanionLayer nav={nav} bottomNavVisible={showBottomNav} />
          </ErrorBoundary>
        </main>
      </ToastProvider>
    </SettingsProvider>
  );
}
