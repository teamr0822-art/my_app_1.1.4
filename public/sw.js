/*
 * よりみっけのオフライン対応。
 *
 * 旅先では、山際の史跡・地下街・電波の細い旧市街で普通に圏外になります。
 * そのときアプリごと開けないのが一番困るので、
 *   - アプリ本体（HTML と JS。スポットデータはこの JS に含まれる）
 *   - 一度表示した地図タイル
 * をキャッシュし、圏外でも「開いて、データを見て、地図を眺める」まではできる
 * 状態にします。AI の応答とルート探索はネットが要るので、キャッシュしません。
 *
 * 更新方法: CACHE_VERSION を上げると、古いキャッシュは activate で消えます。
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `yorimikke-shell-${CACHE_VERSION}`;
const TILE_CACHE = `yorimikke-tiles-${CACHE_VERSION}`;

/** タイルを無制限に貯めると端末の容量を食うので、上限を決めて古い順に捨てる。 */
const TILE_LIMIT = 400;

const SHELL_ASSETS = ["/", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // 1つでも落とせなければインストール失敗、では厳しすぎる。
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("yorimikke-") && k !== SHELL_CACHE && k !== TILE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // AI と経路探索は、古い答えを返すほうが害になる。素通し。
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  if (url.hostname.endsWith("project-osrm.org")) return;

  // 地図タイル: 一度見た範囲は圏外でも出す。
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") {
              const copy = res.clone();
              caches.open(TILE_CACHE).then((cache) => {
                cache.put(req, copy);
                trimCache(TILE_CACHE, TILE_LIMIT);
              });
            }
            return res;
          })
          .catch(() => hit ?? Response.error());
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 画面遷移: まずネット、だめならキャッシュしたトップ。
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // ビルド成果物（JS/CSS/フォント）はハッシュ付きなので、キャッシュ優先で問題ない。
  // スポットデータ151件もこの JS に含まれるため、これで圏外でも一覧が出る。
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit ?? Response.error());
    }),
  );
});
