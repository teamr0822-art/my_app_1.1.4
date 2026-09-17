"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AREA_CENTERS, FALLBACK_CENTER, areaOf, centerOfArea, nearestSpot } from "@/lib/spots";

/**
 * 現在地を、アプリ全体で1つだけ管理する。
 *
 * ■ なぜ書き直したか
 * 旧 useGeolocation は画面ごとに watchPosition を張り、測位に失敗しても黙って
 * 高知市の座標を返していた。その結果、広島にいる人にも「70m」「560m」という
 * 高知市内の距離が表示され、そのまま歩き出せてしまう。屋外では権限拒否・
 * ビル街の誤差・省電力での測位停止が普通に起きるので、これは例外ではなく日常。
 *
 * ここでの原則:
 *   1. 端末の測位が取れていないときは、距離を一切出さない（canMeasure=false）
 *   2. 取れていないことを画面に出す（status）
 *   3. 代わりに「いまいる街」を手で選べる（manualArea／端末に保存）
 *   4. 監視は1つだけ。案内していないときは止める（電池）
 */

/** これより精度が悪い測位は「街は分かるが距離は名乗れない」として扱う。 */
const ACCURACY_LIMIT_M = 200;

export type GeoStatus =
  | "locating" // 測位中
  | "ok" // 実測位あり
  | "coarse" // 測位はしたが精度が悪い
  | "denied" // 権限がない
  | "unsupported" // ブラウザが非対応
  | "error"; // タイムアウトなど

export type LocationState = {
  /** 地図や候補抽出に使う座標。実測位 → 手動で選んだ街 → 既定値 の順。 */
  pos: [number, number];
  /** 実測位（十分な精度）。距離を名乗ってよいのはこれがあるときだけ。 */
  fix: [number, number] | null;
  accuracy: number | null;
  status: GeoStatus;
  /** 距離を表示してよいか。これが false の画面は「約○m」を出さない。 */
  canMeasure: boolean;
  /** 旧APIとの互換。canMeasure と同義。 */
  located: boolean;
  error: string | null;
  /** いま基準にしている街の名前（実測位なら最寄りスポットの市区町村）。 */
  areaLabel: string;
  /** 利用者が手で選んだ街。null なら自動。 */
  manualArea: string | null;
  setManualArea: (area: string | null) => void;
  /** 案内中だけ高精度監視にするためのスイッチ。 */
  setHighAccuracy: (on: boolean) => void;
  /** 権限を訊き直す（拒否後に設定で許可した人向け）。 */
  retry: () => void;
};

const STORAGE_KEY = "yorimikke-area-v1";

const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [fix, setFix] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>("locating");
  const [error, setError] = useState<string | null>(null);
  const [manualArea, setManualAreaState] = useState<string | null>(null);
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const watchId = useRef<number | null>(null);

  // 保存してある「手で選んだ街」を復元する。旅先で毎回選び直さなくていいように。
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && AREA_CENTERS[saved]) setManualAreaState(saved);
    } catch {
      /* プライベートモード等では黙って無視する */
    }
  }, []);

  const setManualArea = useCallback((area: string | null) => {
    setManualAreaState(area);
    try {
      if (area) window.localStorage.setItem(STORAGE_KEY, area);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 保存できなくても動作は続ける */
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      setError("この端末では位置情報を使えません");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (p) => {
        const acc = p.coords.accuracy ?? null;
        setAccuracy(acc);
        setFix([p.coords.latitude, p.coords.longitude]);
        setError(null);
        // 精度が悪いときは「街は分かるが距離は名乗れない」。ビルの谷間や
        // 屋内では数百mずれるので、そのまま距離にすると嘘になる。
        setStatus(acc !== null && acc > ACCURACY_LIMIT_M ? "coarse" : "ok");
      },
      (err) => {
        setFix(null);
        setAccuracy(null);
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setError("位置情報の利用が許可されていません");
        } else if (err.code === err.TIMEOUT) {
          setStatus("error");
          setError("位置情報を取得できませんでした（電波の弱い場所かもしれません）");
        } else {
          setStatus("error");
          setError("位置情報を取得できませんでした");
        }
      },
      {
        // 案内中だけ高精度。常時オンだと半日の観光で電池を食い切る。
        enableHighAccuracy: highAccuracy,
        maximumAge: highAccuracy ? 5000 : 60000,
        timeout: 15000,
      },
    );
    watchId.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      watchId.current = null;
    };
  }, [highAccuracy, attempt]);

  const retry = useCallback(() => {
    setStatus("locating");
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<LocationState>(() => {
    const canMeasure = status === "ok" && fix !== null;
    const manualCenter = centerOfArea(manualArea);
    const pos: [number, number] = fix ?? manualCenter ?? FALLBACK_CENTER;
    const areaLabel = manualArea ?? areaOf(nearestSpot(pos).spot) ?? "";
    return {
      pos,
      fix,
      accuracy,
      status,
      canMeasure,
      located: canMeasure,
      error,
      areaLabel,
      manualArea,
      setManualArea,
      setHighAccuracy,
      retry,
    };
  }, [fix, accuracy, status, error, manualArea, setManualArea, retry]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocation は LocationProvider の内側で使ってください");
  }
  return ctx;
}
