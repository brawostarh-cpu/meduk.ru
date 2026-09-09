"use strict";

/* Офлайн-кэш Meduk Relax. Работает только на https (домен meduk.ru). */
const CACHE = "meduk-relax-v20";
/* Тот же номер, что в index.html. Меняется адрес файла — значит старая копия
   из браузерного кэша уже не подойдёт, и человек гарантированно получит новую. */
const VER = "?v=20";
const CORE = [
  "./",
  "404.html",
  "styles.css" + VER,
  "theme-init.js" + VER,
  "stats.js" + VER,
  "app.js" + VER,
  "audio.js" + VER,
  "manifest.webmanifest" + VER,
  "assets/emblem.webp",
  "assets/mark-88.webp",
  "assets/favicon-64.png",
  "assets/apple-touch-icon.png",
  "assets/icon-192.webp",
  "assets/icon-512.webp",
  "assets/fonts/manrope-var-cyrillic-v2.woff2",
  "assets/fonts/manrope-var-latin-v2.woff2",
  "assets/fonts/unbounded-var-cyrillic-v2.woff2",
  "assets/fonts/unbounded-var-latin-v2.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* cache: "reload" — забирать файлы с сервера, минуя браузерный кэш.
         Без этого в новый кэш легли бы те же старые копии, и обновление
         сайта было бы бессмысленным. */
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Счётчик и админка мимо кэша: там всегда нужен живой ответ сервера,
  // иначе можно было бы получить чужую или устаревшую страницу панели.
  if (url.pathname.endsWith(".php") || url.pathname.indexOf("/admin") === 0) return;

  /* Саму страницу всегда берём из сети. Если отдавать её из кэша, то после
     обновления сайта человек видит старую вёрстку и сам выбраться из этого
     не может. Кэш здесь — только запасной аэродром, когда сети нет. */
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const homeRequest = url.pathname === "/" || url.pathname.endsWith("/index.html");
        try {
          const res = await fetch(req);
          const contentType = res.headers.get("Content-Type") || "";
          if (homeRequest && res.ok && contentType.toLowerCase().includes("text/html")) {
            const cache = await caches.open(CACHE);
            await cache.put("./", res.clone());
          }
          return res;
        } catch (error) {
          if (homeRequest) {
            return await caches.match("./");
          }
          return (await caches.match("404.html")) || Response.error();
        }
      })()
    );
    return;
  }

  /* Остальное — из кэша: в адресах стилей и скриптов стоит номер версии,
     поэтому после обновления это уже другие адреса и старое не подсунется. */
  event.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then(async (res) => {
        if (res.ok) {
          const copy = res.clone();
          const cache = await caches.open(CACHE);
          await cache.put(req, copy);
        }
        return res;
      })
    )
  );
});
