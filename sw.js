// 홈 화면 앱(PWA)용 서비스 워커.
// 항상 인터넷에서 최신 파일을 받고(새 영상·녹취가 바로 보이도록), 인터넷이 끊겼을 때만 마지막으로 본 화면을 보여줍니다.
const CACHE = "mahanaim-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return; // 유튜브·폰트 등은 건드리지 않음
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./"))),
  );
});
