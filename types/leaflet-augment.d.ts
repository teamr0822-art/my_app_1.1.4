import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    /** Enable map rotation (provided by leaflet-rotate). */
    rotate?: boolean;
    /** Allow a two-finger twist to rotate the map. */
    touchRotate?: boolean;
    /** Initial bearing, in degrees clockwise from north. */
    bearing?: number;
  }
  interface Map {
    setBearing(bearing: number): this;
    getBearing(): number;
  }
}
