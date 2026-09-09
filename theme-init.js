/* Meduk Relax — тема ставится до первой отрисовки, чтобы страница не мигала.
   По умолчанию светлая «Бумага». Тёмную человек включает сам, и выбор запоминается.
   Ключ v2, а не v1: у прежних посетителей в v1 записана тёмная тема, и тащить её дальше нельзя. */
(function () {
  "use strict";

  var ALL = ["paper", "light", "gold"];
  var COLORS = { paper: "#efe6d0", light: "#ffffff", gold: "#050505" };
  var theme = "paper";

  try {
    var saved = JSON.parse(localStorage.getItem("meduk.theme.v2"));
    if (ALL.indexOf(saved) !== -1) theme = saved;
  } catch (e) { /* приватный режим или битое значение */ }

  document.documentElement.dataset.theme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COLORS[theme]);
})();
