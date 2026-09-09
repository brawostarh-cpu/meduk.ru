"use strict";

/* Meduk Relax — необязательная собственная аналитика.
   Запускается только после явного выбора пользователя и не запускается при GPC/DNT.
   События уходят только на сервер Meduk; сырой IP/UA в журнал не записывается. */
(function () {
  // Со сборки на диске (file://) слать некуда
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return;
  try {
    if (localStorage.getItem("meduk.analytics.consent.v1") !== "yes") return;
  } catch (e) {
    return;
  }

  var ENDPOINT = "collect.php";
  var SECTIONS = ["player", "presets", "mixer", "focus", "breath", "science", "support"];

  var queue = [];
  var timer = null;
  var started = Date.now();

  function analyticsAllowed() {
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return false;
    try { return localStorage.getItem("meduk.analytics.consent.v1") === "yes"; }
    catch (e) { return false; }
  }

  // Метка визита живёт только до закрытия вкладки — между заходами человек не связывается
  var SID = (function () {
    try {
      var s = sessionStorage.getItem("meduk.sid");
      if (!s) {
        s = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem("meduk.sid", s);
      }
      return s;
    } catch (e) { return "nostore"; }
  })();

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!analyticsAllowed()) { queue.length = 0; return; }
    if (!queue.length) return;
    var body = JSON.stringify({ sid: SID, events: queue.splice(0, queue.length) });
    try {
      if (navigator.sendBeacon) {
        // text/plain — чтобы браузер не слал лишний предварительный запрос
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
        return;
      }
    } catch (e) { /* уходим на fetch */ }
    try {
      fetch(ENDPOINT, {
        method: "POST",
        body: body,
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
      });
    } catch (e) { /* статистика не критична, молчим */ }
  }

  function push(name, props) {
    if (!analyticsAllowed()) return;
    if (typeof name !== "string" || !name) return;
    if (queue.length > 40) return; // страховка от зацикливания
    var ev = { n: name.slice(0, 32), t: Math.round((Date.now() - started) / 1000) };
    if (props && typeof props === "object") {
      var out = {};
      Object.keys(props).slice(0, 6).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === "") return;
        out[String(k).slice(0, 16)] = String(v).slice(0, 64);
      });
      ev.p = out;
    }
    queue.push(ev);
    if (queue.length >= 10) flush();
    else if (!timer) timer = setTimeout(flush, 4000);
  }

  window.medukTrack = push;

  /* Заход. Из источника берём только домен — полные адреса не нужны. */
  var ref = "";
  try {
    if (document.referrer) {
      var u = new URL(document.referrer);
      if (u.host && u.host !== location.host) ref = u.host;
    }
  } catch (e) { /* кривой referrer */ }

  push("visit", {
    ref: ref,
    w: window.innerWidth,
    lang: (navigator.language || "").slice(0, 5),
    pwa: window.matchMedia("(display-mode: standalone)").matches ? "1" : "",
    theme: document.documentElement.dataset.theme || "",
  });

  /* Клики, ради которых всё и затевалось: Telegram, поддержка, пресеты.
     Слушаем на перехвате, чтобы засчитать даже если обработчик сайта остановит событие. */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var don = t.closest("[data-donate]");
    if (don) { push("donate", { kind: don.getAttribute("data-donate") }); flush(); return; }

    var link = t.closest("a[href]");
    if (link && (link.getAttribute("href") || "").indexOf("t.me") !== -1) {
      push("telegram", { from: link.id || "link" });
      flush();
      return;
    }

    var card = t.closest("#presetGrid [data-preset]");
    if (card) push("preset", { id: card.getAttribute("data-preset") });
  }, true);

  /* Докуда человек дочитал: раздел засчитывается, когда он в середине экрана.
     Через середину, а не через долю площади — иначе длинные разделы не считались бы. */
  try {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var en = entries[i];
        if (!en.isIntersecting) continue;
        var id = en.target.id;
        if (!id || seen[id]) continue;
        seen[id] = 1;
        push("section", { id: id });
      }
    }, { threshold: 0.01, rootMargin: "-25% 0px -25% 0px" });

    var observe = function () {
      SECTIONS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) io.observe(el);
      });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe);
    else observe();
  } catch (e) { /* браузер без IntersectionObserver */ }

  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  /* Живые цифры в шапке: сколько человек здесь сейчас и сколько было
     активных посетитель-дней за 30 дней. Суточный псевдоним не равен человеку. */
  function paintPulse(data) {
    if (!data) return;
    var line = document.getElementById("liveLine");
    var online = document.getElementById("liveOnline");
    var visitorDays = document.getElementById("liveVisitorDays");
    if (!line || !online || !visitorDays) return;
    var visitorDayValue = typeof data.visitorDays === "number" ? data.visitorDays : data.month;
    if (!Number.isInteger(data.online) || !Number.isInteger(visitorDayValue)) return;
    online.textContent = data.online;
    visitorDays.textContent = visitorDayValue + (data.visitorDaysCapped ? "+" : "");
    line.hidden = false;
  }

  function pulse() {
    if (!analyticsAllowed()) return;
    if (document.visibilityState === "hidden") return; // фоновую вкладку за присутствие не считаем
    try {
      fetch("pulse.php", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(paintPulse)
        .catch(function () { /* цифры не критичны, молчим */ });
    } catch (e) { /* совсем старый браузер */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pulse);
  else pulse();
  setInterval(pulse, 60000);
})();
