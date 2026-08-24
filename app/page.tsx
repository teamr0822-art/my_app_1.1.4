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

export type Screen = "home" | "map" | "route" | "settings" | "spot";

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
          {screen === "home" && <HomeScreen nav={nav} />}
          {screen === "map" && <MapScreen nav={nav} routeIds={routeIds} routeTransport={routeTransport} />}
          {screen === "route" && <RouteScreen nav={nav} />}
          {screen === "settings" && <SettingsScreen />}
          {screen === "spot" && spotId && <SpotScreen spotId={spotId} nav={nav} />}

          {showBottomNav && <BottomNav nav={nav} />}

          <CompanionLayer nav={nav} bottomNavVisible={showBottomNav} />
        </main>
      </ToastProvider>
    </SettingsProvider>
  );
}
