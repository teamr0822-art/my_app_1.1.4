"use client";

/**
 * 旧APIの入り口。中身は lib/location-context.tsx に移りました。
 *
 * 以前はこのフックが画面ごとに watchPosition を張り、測位できなくても黙って
 * 高知市の座標を返していました。いまは LocationProvider が1つだけ監視し、
 * 測位できていないときは canMeasure=false を返します。距離を表示する画面は
 * 必ずこの値を見てください。
 */
export { useLocation as useGeolocation } from "@/lib/location-context";
export type { LocationState as GeoState, GeoStatus } from "@/lib/location-context";
