"use strict";

/* Защита от кликджекинга: сайт нельзя показывать во фрейме чужой страницы */
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try { window.top.location = window.location; } catch (e) { /* чужой origin */ }
}

/* ================= Конфиг ================= */

// Ссылки поддержки. Пустая ссылка = кнопка вежливо скажет, что сбор пока закрыт.
const DONATE_LINKS = {
  sbor: "https://www.tbank.ru/cf/5SeUVNnrWu5", // сбор Т-Банка
  cloudtips: "",                               // например "https://pay.cloudtips.ru/p/xxxxxxxx"
};

const TELEGRAM_URL = "https://t.me/+BvaPVrvzDtswZjE6";

/* ================= Данные ================= */

const BANDS = {
  delta: { label: "дельта", min: 0.5, max: 4, hz: 2.5 },
  theta: { label: "тета", min: 4, max: 8, hz: 6 },
  alpha: { label: "альфа", min: 8, max: 12, hz: 10 },
  beta: { label: "бета", min: 12, max: 30, hz: 14 },
  gamma: { label: "гамма", min: 30, max: 40, hz: 34 },
};

const LAYER_NAMES = ["rain", "ocean", "fire", "wind", "stream", "night", "chimes"];
const NOISE_KINDS = ["off", "white", "pink", "brown"];
const MODES = ["binaural", "isochronic", "off"];

const PRESETS = [
  {
    id: "focus", cat: "focus", name: "Тихий дождь", band: "beta", hz: 14, carrier: 220,
    mode: "binaural", beatLevel: 45,
    layers: { rain: 35, ocean: 0, fire: 0, wind: 0, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Ровный ритм и тихий дождь для длинной задачи.",
    featured: true,
  },
  {
    id: "reading", cat: "focus", name: "Чтение", band: "beta", hz: 12.5, carrier: 210,
    mode: "binaural", beatLevel: 40,
    layers: { rain: 20, ocean: 0, fire: 0, wind: 0, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Лёгкая пульсация на границе альфы и беты на фоне чтения.",
  },
  {
    id: "clear", cat: "focus", name: "Стеклянный тон", band: "alpha", hz: 11.4, carrier: 242,
    mode: "binaural", beatLevel: 35,
    layers: { rain: 0, ocean: 0, fire: 0, wind: 12, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Минимум слоёв, почти тишина со стеклянным тоном.",
  },
  {
    id: "cram", cat: "study", name: "Ночная зубрёжка", band: "alpha", hz: 10.2, carrier: 220,
    mode: "binaural", beatLevel: 45,
    layers: { rain: 20, ocean: 0, fire: 25, wind: 0, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Дождь, костёр и ровный тон для ночных конспектов.",
  },
  {
    id: "memory", cat: "study", name: "40 Гц и ручей", band: "gamma", hz: 40, carrier: 250,
    mode: "binaural", beatLevel: 38,
    layers: { rain: 0, ocean: 0, fire: 0, wind: 0, stream: 15 },
    noise: { kind: "off", level: 30 },
    copy: "Быстрая пульсация и тихий ручей. Доказанного улучшения памяти от такой частоты нет.",
  },
  {
    id: "exam", cat: "study", name: "Перед экзаменом", band: "alpha", hz: 8.4, carrier: 196,
    mode: "binaural", beatLevel: 40,
    layers: { rain: 0, ocean: 30, fire: 0, wind: 0, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Океан и медленный тон для короткой паузы перед экзаменом.",
  },
  {
    id: "afterclass", cat: "study", name: "После пары", band: "theta", hz: 6, carrier: 174,
    mode: "binaural", beatLevel: 42,
    layers: { rain: 0, ocean: 0, fire: 0, wind: 25, stream: 0 },
    noise: { kind: "pink", level: 22 },
    copy: "Мягкий ветер и розовый шум после длинного учебного дня.",
  },
  {
    id: "aftershift", cat: "rest", name: "После смены", band: "theta", hz: 5.5, carrier: 150,
    mode: "binaural", beatLevel: 40,
    layers: { rain: 30, ocean: 35, fire: 0, wind: 0, stream: 0 },
    noise: { kind: "brown", level: 18 },
    copy: "Тёмный тёплый фон для тихого вечера после смены.",
  },
  {
    id: "meditate", cat: "rest", name: "Медитация", band: "theta", hz: 6.5, carrier: 136,
    mode: "binaural", beatLevel: 45,
    layers: { rain: 0, ocean: 0, fire: 0, wind: 0, stream: 35 },
    noise: { kind: "off", level: 30 },
    copy: "Ровное течение ручья для практики внимания.",
  },
  {
    id: "creative", cat: "rest", name: "Творчество", band: "theta", hz: 7.8, carrier: 180,
    mode: "binaural", beatLevel: 42,
    layers: { rain: 0, ocean: 0, fire: 20, wind: 0, stream: 15 },
    noise: { kind: "off", level: 30 },
    copy: "Расслабленное внимание для эскизов, текстов и идей.",
  },
  {
    id: "romance", cat: "rest", name: "Романтика", band: "theta", hz: 5, carrier: 111,
    mode: "binaural", beatLevel: 40,
    layers: { rain: 0, ocean: 18, fire: 50, wind: 0, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Тёплый треск костра и низкий мягкий тон для вечера вдвоём.",
  },
  {
    id: "walk", cat: "rest", name: "Прогулка", band: "alpha", hz: 10, carrier: 240,
    mode: "isochronic", beatLevel: 42,
    layers: { rain: 0, ocean: 0, fire: 0, wind: 20, stream: 25 },
    noise: { kind: "off", level: 30 },
    copy: "Изохронный ритм не требует наушников. Используй только там, где звук не мешает слышать опасность.",
  },
  {
    id: "nap", cat: "sleep", name: "Дневной сон", band: "theta", hz: 4.2, carrier: 130,
    mode: "binaural", beatLevel: 38,
    layers: { rain: 25, ocean: 20, fire: 0, wind: 0, stream: 0 },
    noise: { kind: "off", level: 30 },
    copy: "Двадцать минут дрёмы. Ставь сон-таймер на 30: десять уйдёт на засыпание.",
  },
  {
    id: "sleep", cat: "sleep", name: "Медленные волны", band: "delta", hz: 2.5, carrier: 120,
    mode: "binaural", beatLevel: 38,
    layers: { rain: 0, ocean: 45, fire: 0, wind: 15, stream: 0 },
    noise: { kind: "brown", level: 15 },
    copy: "Очень медленный ритм и далёкие волны. Включи сон-таймер.",
  },
];

const BREAK_MIX = {
  mode: "off", band: "theta", hz: 6, carrier: 150, beatLevel: 30,
  layers: { rain: 0, ocean: 45, fire: 0, wind: 0, stream: 0 },
  noise: { kind: "off", level: 0 },
};

const BREAK_TIPS = [
  "Встань и потянись, спина скажет спасибо.",
  "Подойди к окну и посмотри вдаль хотя бы полминуты.",
  "Сделай пару глотков воды.",
  "Разомни шею и плечи, медленно и без рывков.",
  "Пройдись по комнате или коридору.",
  "Разомни кисти и пальцы.",
  "Открой окно на пару минут, свежий воздух бодрит.",
  "Посмотри на что-нибудь зелёное подальше от экрана.",
  "Пять медленных вдохов и длинных выдохов.",
  "Если перерыв длинный, лучшее вложение времени — короткая прогулка.",
];

const BREATH_TECHNIQUES = {
  "478": {
    label: "4-7-8",
    desc: "Вдох на 4 счёта, задержка на 7, длинный выдох на 8. Выдох вдвое длиннее вдоха, поэтому схему часто выбирают на вечер.",
    steps: [["Вдох", 4, "in"], ["Задержка", 7, "hold"], ["Выдох", 8, "out"]],
  },
  box: {
    label: "Квадрат",
    desc: "Вдох, задержка, выдох и снова задержка, всё по 4 счёта. Ровный счёт без длинных пауз: подходит, когда 4-7-8 кажется слишком долгим.",
    steps: [["Вдох", 4, "in"], ["Задержка", 4, "hold"], ["Выдох", 4, "out"], ["Задержка", 4, "hold-out"]],
  },
  even: {
    label: "Ровное",
    desc: "Вдох на 5 и выдох на 5, без задержек. Самая простая схема: считать нужно всего одно число.",
    steps: [["Вдох", 5, "in"], ["Выдох", 5, "out"]],
  },
};

/* Порядок обхода переключателя: сначала светлые, тёмная последней. */
const THEMES = ["paper", "light", "gold"];
const THEME_NAMES = { gold: "Полночь", light: "Свет", paper: "Бумага" };
const THEME_COLORS = { gold: "#050505", light: "#ffffff", paper: "#efe6d0" };

const NAV_SECTIONS = ["player", "presets", "mixer", "focus", "breath", "science", "support"];

const BASE_TITLE = document.title;

/* ================= Утилиты ================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* Счётчик посещений живёт в stats.js. Если его нет или он упал — сайт работает как обычно. */
const track = (name, props) => {
  try { if (window.medukTrack) window.medukTrack(name, props); } catch (e) { /* статистика не критична */ }
};

const rawStorage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* приватный режим */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* приватный режим */ }
  },
};

const ANALYTICS_CONSENT_KEY = "meduk.analytics.consent.v1";

function privacySignalActive() {
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

function analyticsChoice() {
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY) || ""; }
  catch (e) { return ""; }
}

function setAnalyticsChoice(value) {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
    return localStorage.getItem(ANALYTICS_CONSENT_KEY) === value;
  } catch (e) {
    return false; // приватный режим: оставляем аналитику выключенной
  }
}

function wireAnalyticsConsent() {
  const panel = $("#analyticsConsent");
  const status = $("#analyticsStatus");
  const refreshStatus = () => {
    if (privacySignalActive()) status.textContent = "Аналитика отключена сигналом GPC/DNT.";
    else if (analyticsChoice() === "yes") status.textContent = "Сейчас разрешена.";
    else if (analyticsChoice() === "no") status.textContent = "Сейчас не разрешена.";
    else status.textContent = "Выбор ещё не сделан.";
  };
  const showPanel = () => {
    if (privacySignalActive()) {
      toast("Аналитика отключена сигналом GPC/DNT в браузере");
      return;
    }
    panel.hidden = false;
    $("#analyticsDecline").focus();
  };

  /* Раньше оба ответа перезагружали страницу. Если человек уже включил звук
     или запустил помодоро, клик по баннеру обрывал сессию — это больно.
     stats.js проверяет согласие при каждом событии, поэтому:
     — «Не разрешать» не требует перезагрузки вовсе;
     — «Разрешить» требует её только чтобы запустить сборщики немедленно.
       Во время живой сессии не перезагружаем: сбор начнётся со следующего
       открытия страницы, а сессия остаётся целой. */
  const sessionBusy = () =>
    (typeof state !== "undefined" && state.playing) ||
    (typeof pomo !== "undefined" && pomo.running) ||
    (typeof breath !== "undefined" && breath.running);

  $("#analyticsAccept").addEventListener("click", () => {
    if (!setAnalyticsChoice("yes")) {
      toast("Браузер не сохранил выбор — аналитика осталась выключенной");
      return;
    }
    if (!sessionBusy()) {
      location.reload(); // stats.js увидит выбор при новом запуске страницы
      return;
    }
    panel.hidden = true;
    refreshStatus();
    toast("Спасибо. Сбор начнётся при следующем открытии, звук не трогаем.");
  });
  $("#analyticsDecline").addEventListener("click", () => {
    if (!setAnalyticsChoice("no")) {
      toast("Браузер не сохранил выбор — аналитика осталась выключенной");
    }
    panel.hidden = true;
    refreshStatus();
  });
  $("#privacySettings").addEventListener("click", showPanel);

  refreshStatus();
  if (!privacySignalActive() && analyticsChoice() === "") panel.hidden = false;

  // «Подробнее» в баннере ведёт на свёрнутый ответ в «Вопросах» — раскрываем его,
  // иначе человек прыгает к закрытой строке и ничего не видит
  const openPrivacyTarget = () => {
    if (location.hash !== "#privacy") return;
    const d = document.getElementById("privacy");
    if (d) d.open = true;
  };
  window.addEventListener("hashchange", openPrivacyTarget);
  openPrivacyTarget();
}

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionQuery.matches;
motionQuery.addEventListener("change", (e) => {
  const was = reducedMotion;
  reducedMotion = e.matches;
  if (reducedMotion) {
    $$(".reveal").forEach((el) => el.classList.add("is-visible"));
    drawFrame(performance.now());
  } else if (was) {
    requestAnimationFrame(drawFrame);
  }
});

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const fmtHz = (v) => v.toFixed(1).replace(".", ",");

const fmtMin = (min) => {
  const m = Math.round(min);
  if (m < 90) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
};

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let toastTimer = 0;
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}

function activate(group, active) {
  [...group.children].forEach((btn) => {
    const on = btn === active;
    btn.classList.toggle("is-active", on);
    if (btn.hasAttribute("aria-pressed")) btn.setAttribute("aria-pressed", String(on));
  });
}

/* Закрытие диалога кликом по подложке.
   Клики по детям (в том числе клавиатурные, у них clientX = 0) не считаются. */
function wireDialogDismiss(dialog) {
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}

/* ================= Профили: всё хранится только в этом браузере ================= */

const USERS_KEY = "meduk.users.v1";
const SESSION_KEY = "meduk.session.v1";
/* Что копируем гостю в новый профиль и что переносит экспорт */
const PROFILE_SUFFIXES = ["mix.v1", "mixes.v1", "stats.v3", "stats.v2", "pomo.v2", "breath.v1"];
const EXPORT_SUFFIXES = ["mix.v1", "mixes.v1", "stats.v3", "pomo.v2", "breath.v1"];

function loadUsers() {
  const raw = rawStorage.get(USERS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u) => u && typeof u === "object" && typeof u.id === "string" && typeof u.email === "string" && typeof u.hash === "string")
    .map((u) => ({
      id: u.id.slice(0, 24),
      email: u.email.slice(0, 80).toLowerCase(),
      name: typeof u.name === "string" ? u.name.slice(0, 20) : "",
      avatar: typeof u.avatar === "string" ? u.avatar.slice(0, 4) : "🌙",
      salt: typeof u.salt === "string" ? u.salt.slice(0, 32) : "",
      hash: u.hash.slice(0, 80),
      algo: u.algo === "pbkdf2" ? "pbkdf2" : "legacy",
      created: typeof u.created === "string" ? u.created : localDateKey(),
    }))
    .slice(0, 20);
}

let users = loadUsers();
let sessionId = rawStorage.get(SESSION_KEY, "");
let currentUser = users.find((u) => u.id === sessionId) || null;
if (sessionId && !currentUser) {
  sessionId = "";
  rawStorage.set(SESSION_KEY, "");
}

function dataKeyFor(suffix) {
  return currentUser ? `meduk.u.${currentUser.id}.${suffix}` : `meduk.${suffix}`;
}

/* Хранилище с учётом активного профиля */
const storage = {
  get(suffix, fallback) { return rawStorage.get(dataKeyFor(suffix), fallback); },
  set(suffix, value) { rawStorage.set(dataKeyFor(suffix), value); },
};

function randomId() {
  const arr = new Uint32Array(3);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => n.toString(36)).join("").slice(0, 14);
}

/* Медленный вывод ключа: перебор пароля из localStorage становится дорогим */
async function hashPass(pass, salt) {
  const enc = new TextEncoder();
  try {
    if (window.crypto && crypto.subtle) {
      const km = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 310000 },
        km, 256,
      );
      return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) { /* нет subtle: ниже медленный, но не мгновенный фолбэк */ }
  const text = `${salt}:${pass}`;
  let h1 = 2166136261;
  let h2 = 40389;
  for (let round = 0; round < 120000; round += 1) {
    for (let i = 0; i < text.length; i += 1) {
      h1 = Math.imul(h1 ^ text.charCodeAt(i) ^ round, 16777619);
      h2 = Math.imul(h2 ^ text.charCodeAt(i) ^ h1, 2654435761);
    }
  }
  return `fb-${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}`;
}

/* Старый формат (v4.0): один раунд SHA-256. Нужен, чтобы узнать ранние профили и обновить их. */
async function legacyHash(pass, salt) {
  const text = `${salt}:${pass}`;
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) { /* без subtle легаси-профилей не существует */ }
  return null;
}

function persistUsers() {
  rawStorage.set(USERS_KEY, users);
}

function syncProfileUI() {
  const chip = $("#avatarChip");
  const nameEl = $("#profileName");
  const btn = $("#profileBtn");
  if (currentUser) {
    chip.textContent = currentUser.avatar;
    nameEl.textContent = currentUser.name || currentUser.email.split("@")[0];
    btn.classList.add("is-authed");
    btn.setAttribute("aria-label", `Профиль: ${currentUser.name || currentUser.email}`);
  } else {
    nameEl.textContent = "Войти";
    btn.classList.remove("is-authed");
    btn.setAttribute("aria-label", "Войти или создать профиль");
  }
}

/* ---------- Диалог входа ---------- */

let authMode = "login";
let pickedAvatar = "🌙";

function setAuthMode(mode) {
  authMode = mode;
  const isReg = mode === "register";
  const isReset = mode === "reset";
  $("#fieldName").hidden = !isReg;
  $("#avatarRow").hidden = !isReg;
  $("#forgotBtn").hidden = isReg || isReset;
  $("#authTitle").textContent = isReg ? "Создать профиль" : (isReset ? "Новый пароль" : "С возвращением");
  $("#authSubmit").textContent = isReg ? "Зарегистрироваться" : (isReset ? "Сохранить пароль" : "Войти");
  $("#passLabel").textContent = isReset ? "Новый пароль" : "Пароль";
  const pass = $("#authPass");
  pass.setAttribute("autocomplete", isReg || isReset ? "new-password" : "current-password");
  pass.placeholder = isReg ? "Придумай пароль, минимум 6 символов" : "Минимум 6 символов";
  $("#authNote").textContent = isReset
    ? "Новый пароль можно задать прямо здесь, письмо на почту не нужно."
    : (isReg
      ? "Письмо с кодом не придёт: почта нужна только как логин. Придумай отдельный пароль — не тот, что от почты или банка."
      : "Профиль нужен, чтобы сохранить твои настройки и статистику занятий.");
  // Подсказка внизу: куда идти, если аккаунта ещё нет или он уже есть
  $("#authSwitchText").textContent = isReg ? "Уже есть аккаунт?" : "Нет аккаунта?";
  $("#authSwitchBtn").textContent = isReg ? "Войти" : "Зарегистрироваться";
  const err = $("#authError");
  err.hidden = true;
  err.textContent = "";
  const tab = $(`#authTabs [data-authtab="${isReset ? "login" : mode}"]`);
  if (tab) activate($("#authTabs"), tab);
}

function authFail(text) {
  const err = $("#authError");
  err.textContent = text;
  err.hidden = false;
}

async function handleAuthSubmit() {
  const email = $("#authEmail").value.trim().toLowerCase();
  const pass = $("#authPass").value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    authFail("Проверь почту: нужен адрес вида you@example.com");
    return;
  }
  if (pass.length < 6) {
    authFail("Пароль должен быть не короче 6 символов.");
    return;
  }

  if (authMode === "register") {
    if (users.some((u) => u.email === email)) {
      authFail("Профиль с этой почтой уже есть. Попробуй войти.");
      return;
    }
    if (users.length >= 20) {
      authFail("На одном устройстве можно создать до 20 профилей.");
      return;
    }
    const salt = randomId();
    const user = {
      id: randomId(),
      email,
      name: $("#authName").value.trim().slice(0, 20),
      avatar: pickedAvatar,
      salt,
      hash: await hashPass(pass, salt),
      algo: "pbkdf2",
      created: localDateKey(),
    };
    users.push(user);
    persistUsers();
    /* Всё, что накопил гость, переезжает в новый профиль */
    PROFILE_SUFFIXES.forEach((sfx) => {
      const v = rawStorage.get(`meduk.${sfx}`, undefined);
      if (v !== undefined) rawStorage.set(`meduk.u.${user.id}.${sfx}`, v);
    });
    rawStorage.set(SESSION_KEY, user.id);
    toast(`Профиль создан. Привет, ${user.name || email.split("@")[0]}!`);
    setTimeout(() => window.location.reload(), 750);
    return;
  }

  const user = users.find((u) => u.email === email);
  if (authMode === "reset") {
    if (!user) {
      authFail("Профиль с этой почтой не найден.");
      return;
    }
    user.salt = randomId();
    user.hash = await hashPass(pass, user.salt);
    user.algo = "pbkdf2";
    persistUsers();
    toast("Пароль обновлён. Теперь войди с новым паролем.");
    setAuthMode("login");
    $("#authPass").value = "";
    return;
  }

  /* login */
  if (!user) {
    authFail("Профиль с этой почтой не найден. Создай его во вкладке «Регистрация».");
    return;
  }
  let ok = (await hashPass(pass, user.salt)) === user.hash;
  if (!ok && user.algo !== "pbkdf2") {
    /* ранний профиль со старым хешем: проверяем и сразу пересчитываем в новый формат */
    ok = (await legacyHash(pass, user.salt)) === user.hash;
    if (ok) {
      user.salt = randomId();
      user.hash = await hashPass(pass, user.salt);
      user.algo = "pbkdf2";
      persistUsers();
    }
  }
  if (!ok) {
    authFail("Пароль не подошёл. Попробуй ещё раз или нажми «Не помнишь пароль?».");
    return;
  }
  rawStorage.set(SESSION_KEY, user.id);
  toast(`С возвращением, ${user.name || email.split("@")[0]}!`);
  setTimeout(() => window.location.reload(), 650);
}

/* ---------- Диалог профиля ---------- */

let deleteArmed = false;

function openProfileDialog() {
  if (!currentUser) return;
  $("#profAvatar").textContent = currentUser.avatar;
  $("#profName").textContent = currentUser.name || currentUser.email.split("@")[0];
  $("#profEmail").textContent = currentUser.email;
  const stats = loadStats();
  $("#profTotal").textContent = fmtMin(stats.totalMin);
  const created = currentUser.created;
  const d = new Date(`${created}T12:00:00`);
  $("#profSince").textContent = Number.isNaN(d.getTime())
    ? "недавно"
    : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  deleteArmed = false;
  $("#profDelete").textContent = "Удалить профиль";
  $("#profileDialog").showModal();
}

function logout() {
  rawStorage.set(SESSION_KEY, "");
  toast("Профиль закрыт.");
  setTimeout(() => window.location.reload(), 650);
}

function deleteProfile() {
  if (!currentUser) return;
  PROFILE_SUFFIXES.forEach((sfx) => rawStorage.remove(`meduk.u.${currentUser.id}.${sfx}`));
  users = users.filter((u) => u.id !== currentUser.id);
  persistUsers();
  rawStorage.set(SESSION_KEY, "");
  toast("Профиль удалён.");
  setTimeout(() => window.location.reload(), 650);
}

/* ================= Темы ================= */

/* theme-init.js уже выбрал тему до первой отрисовки — просто подхватываем её. */
let theme = document.documentElement.dataset.theme;
if (!THEMES.includes(theme)) theme = "paper";

function applyTheme(next) {
  theme = next;
  document.documentElement.dataset.theme = theme;
  $("#themeName").textContent = THEME_NAMES[theme];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  rawStorage.set("meduk.theme.v2", theme);
  refreshWaveColors();
  if (reducedMotion) drawFrame(performance.now());
}

/* ================= Состояние микса ================= */

const state = {
  presetId: "focus",
  presetName: "Тихий дождь",
  presetCopy: PRESETS[0].copy,
  cat: "all",
  mode: "binaural",
  band: "beta",
  hz: 14,
  carrier: 220,
  beatLevel: 45,
  layers: { rain: 35, ocean: 0, fire: 0, wind: 0, stream: 0, night: 0, chimes: 0 },
  noise: { kind: "off", level: 30 },
  master: 40,
  playing: false,
  sleepMinutes: 0,
  sleepDeadline: 0,
};

function sanitizeMix(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  out.mode = MODES.includes(raw.mode) ? raw.mode : "binaural";
  out.band = BANDS[raw.band] ? raw.band : "beta";
  out.hz = clampNum(raw.hz, 0.5, 40, BANDS[out.band].hz);
  out.carrier = clampNum(raw.carrier, 90, 320, 220);
  out.beatLevel = clampNum(raw.beatLevel, 0, 100, 45);
  out.layers = {};
  LAYER_NAMES.forEach((n) => {
    out.layers[n] = clampNum(raw.layers && raw.layers[n], 0, 100, 0);
  });
  const nk = raw.noise && raw.noise.kind;
  out.noise = {
    kind: NOISE_KINDS.includes(nk) ? nk : "off",
    level: clampNum(raw.noise && raw.noise.level, 0, 100, 30),
  };
  out.master = clampNum(raw.master, 0, 100, 40);
  out.sleepMinutes = [0, 15, 30, 45, 60].includes(Number(raw.sleepMinutes)) ? Number(raw.sleepMinutes) : 0;
  out.presetId = PRESETS.some((p) => p.id === raw.presetId) ? raw.presetId : "";
  out.presetName = typeof raw.presetName === "string" ? raw.presetName.slice(0, 40) : "Свой микс";
  out.presetCopy = typeof raw.presetCopy === "string" ? raw.presetCopy.slice(0, 160) : "Собран вручную в студии.";
  return out;
}

/* ================= Микс в ссылке ================= */

/* Складываем микс в короткий адрес: массивом, без имён полей — так ссылка
   выходит втрое короче. Порядок значений менять нельзя: по нему читаются
   ссылки, которые уже кому-то отправили. */
function mixToCode(m) {
  const arr = [
    m.mode, m.band, m.hz, m.carrier, m.beatLevel,
    ...LAYER_NAMES.map((n) => m.layers[n]),
    m.noise.kind, m.noise.level, m.master, m.sleepMinutes,
  ];
  try {
    return btoa(JSON.stringify(arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) {
    return "";
  }
}

function codeToMix(code) {
  const L = LAYER_NAMES.length;
  try {
    const arr = JSON.parse(atob(String(code).replace(/-/g, "+").replace(/_/g, "/")));
    if (!Array.isArray(arr) || arr.length < 9 + L) return null;
    const layers = {};
    LAYER_NAMES.forEach((n, i) => { layers[n] = arr[5 + i]; });
    /* Гоним через тот же проверяльщик, что и сохранённые миксы: в адресе
       может оказаться что угодно, и до состояния сайта это доходить не должно. */
    return sanitizeMix({
      mode: arr[0], band: arr[1], hz: arr[2], carrier: arr[3], beatLevel: arr[4],
      layers,
      noise: { kind: arr[5 + L], level: arr[6 + L] },
      master: arr[7 + L],
      sleepMinutes: arr[8 + L],
      presetId: "",
      presetName: "Микс по ссылке",
      presetCopy: "Кто-то собрал этот звук и поделился им.",
    });
  } catch (e) {
    return null;
  }
}

const savedMix = sanitizeMix(storage.get("mix.v1", null));
if (savedMix) Object.assign(state, savedMix, { playing: false, sleepDeadline: 0, cat: "all" });

/* Человек пришёл по чужой ссылке — этот микс важнее сохранённого. Код из
   адреса убираем, иначе обновление страницы вечно возвращало бы чужой звук. */
const linkedMix = location.hash.indexOf("#mix=") === 0 ? codeToMix(location.hash.slice(5)) : null;
if (linkedMix) {
  Object.assign(state, linkedMix, { playing: false, sleepDeadline: 0, cat: "all" });
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* не критично */ }
}

function collectMix() {
  return {
    presetId: state.presetId, presetName: state.presetName, presetCopy: state.presetCopy,
    mode: state.mode, band: state.band, hz: state.hz, carrier: state.carrier,
    beatLevel: state.beatLevel,
    layers: { ...state.layers },
    noise: { ...state.noise },
    master: state.master,
    sleepMinutes: state.sleepMinutes,
  };
}

function persistMix() {
  storage.set("mix.v1", collectMix());
}

/* ================= Применение к движку и UI ================= */

function pushBeat() {
  MedukAudio.setBeat({
    mode: state.mode, hz: state.hz, carrier: state.carrier,
    level: state.beatLevel / 100,
  });
}

function pushAll() {
  pushBeat();
  LAYER_NAMES.forEach((name) => MedukAudio.setLayer(name, state.layers[name] / 100));
  MedukAudio.setNoise(state.noise.kind, state.noise.level / 100);
  MedukAudio.setMaster(state.master / 100);
}

const HP_HINTS = {
  binaural: "Бинауральный ритм раскрывается в наушниках.",
  isochronic: "Изохронный ритм слышно даже из колонок.",
  off: "Чистая атмосфера без ритма. Наушники не обязательны.",
};

function syncNowPlaying() {
  $("#currentMode").textContent = state.presetName;
  $("#currentCopy").textContent = state.presetCopy;
  $("#beatValue").textContent = fmtHz(state.hz);
  $("#bandLabel").textContent = state.mode === "off" ? "без ритма" : BANDS[state.band].label;
  $("#hpHint").textContent = HP_HINTS[state.mode];
}

function syncPresetHighlight() {
  $$("#presetGrid .preset-card").forEach((c) => {
    c.classList.toggle("is-active", Boolean(state.presetId) && c.dataset.preset === state.presetId);
  });
}

function markCustom() {
  state.presetId = "";
  state.presetName = "Свой микс";
  state.presetCopy = "Собран вручную в студии.";
  syncPresetHighlight();
}

function syncControls() {
  activate($("#modeSeg"), $(`#modeSeg [data-mode="${state.mode}"]`));
  activate($("#bandChips"), $(`#bandChips [data-band="${state.band}"]`));
  $("#beatControl").min = BANDS[state.band].min;
  $("#beatControl").max = BANDS[state.band].max;
  $("#beatControl").value = state.hz;
  $("#beatOut").textContent = `${fmtHz(state.hz)} Гц`;
  $("#carrierControl").value = state.carrier;
  $("#carrierOut").textContent = `${state.carrier} Гц`;
  $("#beatLevel").value = state.beatLevel;
  $("#beatLevelOut").textContent = `${state.beatLevel}%`;

  LAYER_NAMES.forEach((name) => {
    const row = $(`.layer[data-layer="${name}"]`);
    const lvl = state.layers[name];
    row.querySelector(".layer-level").value = lvl;
    row.classList.toggle("is-on", lvl > 0);
    row.querySelector(".layer-toggle").setAttribute("aria-pressed", String(lvl > 0));
  });

  activate($("#noiseChips"), $(`#noiseChips [data-noise="${state.noise.kind}"]`));
  $("#noiseLevel").value = state.noise.level;
  $("#noiseLevelOut").textContent = `${state.noise.level}%`;

  $("#masterVolume").value = state.master;
  $("#masterOut").textContent = `${state.master}%`;

  activate($("#sleepChips"), $(`#sleepChips [data-minutes="${state.sleepMinutes}"]`) || $('#sleepChips [data-minutes="0"]'));

  syncNowPlaying();
  syncPresetHighlight();
}

function applyMix(mix, { asPreset, transient } = {}) {
  cancelPreview();
  state.mode = mix.mode;
  state.band = mix.band;
  state.hz = mix.hz;
  state.carrier = mix.carrier;
  state.beatLevel = mix.beatLevel;
  // пресеты и старые миксы могут не знать про новые слои — гасим недостающие в 0
  state.layers = {};
  LAYER_NAMES.forEach((n) => { state.layers[n] = clampNum(mix.layers && mix.layers[n], 0, 100, 0); });
  state.noise = { ...mix.noise };
  if (mix.master !== undefined) state.master = mix.master;
  if (asPreset) {
    state.presetId = asPreset.id || "";
    state.presetName = asPreset.name;
    state.presetCopy = asPreset.copy || "Собран вручную в студии.";
  }
  syncControls();
  pushAll();
  if (!transient) persistMix();
}

/* ================= Пресеты и категории ================= */

function buildPresetCards() {
  const grid = $("#presetGrid");
  grid.innerHTML = "";
  const list = PRESETS.filter((p) => state.cat === "all" || p.cat === state.cat);
  list.forEach((preset) => {
    const card = document.createElement("button");
    card.type = "button";
    card.dataset.preset = preset.id;
    const featured = preset.featured && state.cat === "all";
    card.className = `preset-card reveal is-visible${featured ? " featured" : ""}`;
    card.innerHTML = `
      <div class="preset-top">
        <span class="preset-badges">
          <span class="preset-band band-${preset.band}">${BANDS[preset.band].label}</span>
          <span class="eq card-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        </span>
        <span class="preset-hz">${fmtHz(preset.hz)} Гц</span>
      </div>
      <div class="preset-body">
        <strong>${preset.name}</strong>
        <p>${preset.copy}</p>
      </div>
    `;
    card.addEventListener("click", () => {
      applyMix(preset, { asPreset: preset });
      if (!state.playing) togglePlay(true);
    });
    grid.append(card);
  });
  syncPresetHighlight();
}

/* ================= Плей / пауза ================= */

async function togglePlay(force) {
  const next = force !== undefined ? force : !state.playing;
  const wasPlaying = state.playing;
  cancelPreview();
  state.playing = next;
  if (next) {
    MedukAudio.setMaster(state.master / 100);
    fadeStarted = false;
  }
  await MedukAudio.setPlaying(next);
  if (next) {
    pushAll();
    track("play", { preset: state.presetId || "custom" });
    // На iPhone боковой переключатель «без звука» глушит и браузер. Подсказываем один раз.
    if (MedukAudio.isIOS && !rawStorage.get("meduk.iosHint.v1", false)) {
      rawStorage.set("meduk.iosHint.v1", true);
      setTimeout(() => toast("Не слышно? Проверь боковой переключатель звука на iPhone."), 1400);
    }
    listenStart();
  } else {
    listenStop();
  }
  updateNowPlaying();

  [$("#playButton"), $("#masterPlay"), $("#tabPlay")].forEach((btn) => {
    btn.classList.toggle("is-playing", next);
    btn.setAttribute("aria-pressed", String(next));
  });
  $("#playText").textContent = next ? "Пауза" : "Включить звук";
  $("#masterPlayText").textContent = next ? "Пауза" : "Включить звук";
  $("#tabPlay").setAttribute("aria-label", next ? "Пауза" : "Включить звук");
  document.body.classList.toggle("is-playing", next);
  document.title = next ? `▶ ${BASE_TITLE}` : BASE_TITLE;

  if (next && !wasPlaying) {
    const stats = loadStats();
    stats.sessions += 1;
    saveStats(stats);
    renderStats(stats);
  }

  if (next && state.sleepMinutes > 0) {
    state.sleepDeadline = Date.now() + state.sleepMinutes * 60000;
  }
  if (!next) {
    state.sleepDeadline = 0;
    MedukAudio.setMaster(state.master / 100, 0.05);
    $("#sleepReadout").textContent = state.sleepMinutes > 0
      ? `Выключится через ${state.sleepMinutes} минут после старта.`
      : "Звук играет, пока не выключишь.";
  }
}

/* ================= Предпрослушивание слоёв ================= */

let previewTimer = 0;
let previewingBtn = null;

function cancelPreview() {
  clearTimeout(previewTimer);
  previewTimer = 0;
  if (previewingBtn) {
    previewingBtn.classList.remove("is-previewing");
    previewingBtn = null;
  }
}

function endPreview() {
  cancelPreview();
  if (state.playing) {
    pushAll();
  } else {
    MedukAudio.setPlaying(false);
    setTimeout(() => pushAll(), 520);
  }
}

/* Пользователь тронул слой во время превью: превью честно завершается, а не бросает звук включённым */
function endPreviewIfActive() {
  if (previewingBtn) endPreview();
}

function startPreview(btn, name) {
  if (previewingBtn === btn) {
    endPreview();
    return;
  }
  cancelPreview();
  previewingBtn = btn;
  btn.classList.add("is-previewing");
  MedukAudio.previewLayer(name);
  previewTimer = setTimeout(endPreview, 4200);
}

/* ================= Сон-таймер ================= */

let fadeStarted = false;
setInterval(() => {
  if (!state.playing || !state.sleepDeadline) {
    fadeStarted = false;
    return;
  }
  const left = state.sleepDeadline - Date.now();
  if (left <= 0) {
    togglePlay(false);
    fadeStarted = false;
    $("#sleepReadout").textContent = "Таймер завершён. Хорошего отдыха.";
    toast("Сон-таймер завершён. Хорошего отдыха.");
    return;
  }
  if (left < 15000 && !fadeStarted) {
    fadeStarted = true;
    MedukAudio.setMaster(0.02, 14);
  }
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("#sleepReadout").textContent = `Выключение через ${m}:${String(s).padStart(2, "0")}`;
}, 500);

/* ================= Мои миксы ================= */

function loadMixes() {
  const raw = storage.get("mixes.v1", []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.name === "string" && m.data)
    .map((m) => ({ name: m.name.slice(0, 24), data: sanitizeMix(m.data) }))
    .filter((m) => m.data)
    .slice(0, 12);
}

function renderMixes() {
  const mixes = loadMixes();
  const list = $("#mixList");
  list.innerHTML = "";
  $("#mixesEmpty").style.display = mixes.length ? "none" : "block";
  mixes.forEach((mix, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="mix-apply"></button>
      <button type="button" class="mix-del">×</button>
    `;
    li.querySelector(".mix-apply").textContent = mix.name;
    li.querySelector(".mix-del").setAttribute("aria-label", `Удалить микс ${mix.name}`);
    li.querySelector(".mix-apply").addEventListener("click", () => {
      applyMix(mix.data, { asPreset: { id: "", name: mix.name, copy: "Твой сохранённый микс." } });
      toast(`Микс «${mix.name}» включён`);
      if (!state.playing) togglePlay(true);
    });
    li.querySelector(".mix-del").addEventListener("click", () => {
      const next = loadMixes();
      next.splice(index, 1);
      storage.set("mixes.v1", next);
      renderMixes();
      $("#mixName").focus();
    });
    list.append(li);
  });
}

/* ================= Статистика ================= */

function statsDefaults() {
  return {
    totalMin: 0,
    todayMin: 0,
    today: localDateKey(),
    streak: 0,
    lastDay: "",
    pomodoros: 0,
    breaths: 0,
    sessions: 0,
    bands: { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 },
    days: {},
    presets: {},
  };
}

function loadStats() {
  let stats = storage.get("stats.v3", null);
  if (!stats) {
    const old = storage.get("stats.v2", null);
    stats = statsDefaults();
    if (old && typeof old === "object") {
      stats.totalMin = clampNum(old.totalMin, 0, 1e7, 0);
      stats.todayMin = clampNum(old.todayMin, 0, 1440, 0);
      stats.today = typeof old.today === "string" ? old.today : localDateKey();
      stats.streak = clampNum(old.streak, 0, 100000, 0);
      stats.lastDay = typeof old.lastDay === "string" ? old.lastDay : "";
      stats.pomodoros = clampNum(old.pomodoros, 0, 1e6, 0);
      stats.breaths = clampNum(old.breaths, 0, 1e6, 0);
      if (old.bands && typeof old.bands === "object") stats.bands = { ...stats.bands, ...old.bands };
      if (old.days && typeof old.days === "object") stats.days = { ...old.days };
    }
  }
  stats.totalMin = clampNum(stats.totalMin, 0, 1e7, 0);
  stats.todayMin = clampNum(stats.todayMin, 0, 1440, 0);
  stats.breaths = clampNum(stats.breaths, 0, 1e6, 0);
  stats.pomodoros = clampNum(stats.pomodoros, 0, 1e6, 0);
  stats.sessions = clampNum(stats.sessions, 0, 1e6, 0);
  if (!stats.bands || typeof stats.bands !== "object") stats.bands = statsDefaults().bands;
  if (!stats.days || typeof stats.days !== "object") stats.days = {};
  if (!stats.presets || typeof stats.presets !== "object") stats.presets = {};
  /* В объектах-словарях живут только ожидаемые ключи: чужие (из импорта) отбрасываем */
  const cleanBands = statsDefaults().bands;
  Object.keys(cleanBands).forEach((k) => { cleanBands[k] = clampNum(stats.bands[k], 0, 1e7, 0); });
  stats.bands = cleanBands;
  const cleanPresets = {};
  PRESETS.forEach((p) => {
    const v = clampNum(stats.presets[p.id], 0, 1e7, 0);
    if (v > 0) cleanPresets[p.id] = v;
  });
  stats.presets = cleanPresets;
  const cleanDays = {};
  Object.keys(stats.days).forEach((k) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) cleanDays[k] = clampNum(stats.days[k], 0, 1440, 0);
  });
  stats.days = cleanDays;
  if (stats.today !== localDateKey()) {
    stats.today = localDateKey();
    stats.todayMin = 0;
  }
  return stats;
}

function saveStats(stats) {
  const keys = Object.keys(stats.days).sort();
  while (keys.length > 40) delete stats.days[keys.shift()];
  storage.set("stats.v3", stats);
}

let statsRange = 7;

function renderStats(stats) {
  $("#statToday").textContent = fmtMin(stats.todayMin);
  $("#statTotal").textContent = fmtMin(stats.totalMin);
  $("#statStreak").textContent = String(stats.streak);
  $("#statSessions").textContent = String(stats.sessions);
  $("#statPomos").textContent = String(stats.pomodoros);
  $("#statBreaths").textContent = String(stats.breaths);

  const bandEntries = Object.entries(stats.bands).filter(([, v]) => v > 0);
  if (bandEntries.length) {
    const top = bandEntries.sort((a, b) => b[1] - a[1])[0][0];
    $("#statBand").textContent = BANDS[top] ? BANDS[top].label : "пока нет";
  } else {
    $("#statBand").textContent = "пока нет";
  }

  const presetEntries = Object.entries(stats.presets)
    .filter(([id, v]) => v > 0 && PRESETS.some((p) => p.id === id))
    .sort((a, b) => b[1] - a[1]);
  $("#statPreset").textContent = presetEntries.length
    ? PRESETS.find((p) => p.id === presetEntries[0][0]).name
    : "пока нет";

  const allDays = { ...stats.days, [stats.today]: stats.todayMin };
  let bestVal = 0;
  Object.values(allDays).forEach((v) => { if (Number(v) > bestVal) bestVal = Number(v); });
  $("#statBest").textContent = bestVal > 0 ? fmtMin(bestVal) : "впереди";

  /* График по дням */
  const bars = $("#weekBars");
  bars.innerHTML = "";
  const days = [];
  for (let i = statsRange - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    days.push({ key: localDateKey(d), date: d });
  }
  const values = days.map((d) => (d.key === stats.today ? stats.todayMin : (stats.days[d.key] || 0)));
  const max = Math.max(...values, 1);
  /* Скринридеру график отдаём одной картинкой с текстовым описанием */
  bars.setAttribute("role", "img");
  const summary = days
    .map((d, i) => `${d.date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}: ${Math.round(values[i])}`)
    .join(", ");
  bars.setAttribute("aria-label", `Минуты со звуком за ${statsRange === 7 ? "7 дней" : "30 дней"}. ${summary}`);
  const labels = document.createElement("div");
  labels.className = "week-days";
  days.forEach((d, i) => {
    const bar = document.createElement("div");
    bar.className = `week-bar${values[i] > 0 ? "" : " is-empty"}`;
    bar.style.height = `${Math.max(6, Math.round((values[i] / max) * 100))}%`;
    bar.title = `${Math.round(values[i])} мин`;
    bars.append(bar);
    const lab = document.createElement("span");
    if (statsRange === 7) {
      lab.textContent = d.date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
    } else {
      lab.textContent = (i === 0 || i === statsRange - 1 || i % 10 === 0) ? String(d.date.getDate()) : "";
    }
    labels.append(lab);
  });
  const old = $(".week-days");
  if (old) old.remove();
  bars.after(labels);
}

function bumpStreak(stats) {
  const today = localDateKey();
  if (stats.lastDay === today) return;
  const yesterday = localDateKey(new Date(Date.now() - 86400000));
  stats.streak = stats.lastDay === yesterday ? stats.streak + 1 : 1;
  stats.lastDay = today;
}

setInterval(() => {
  if (!state.playing) return;
  const stats = loadStats();
  stats.totalMin += 0.5;
  stats.todayMin += 0.5;
  stats.days[stats.today] = stats.todayMin;
  if (state.mode !== "off" && stats.bands[state.band] !== undefined) stats.bands[state.band] += 0.5;
  if (state.presetId) {
    stats.presets[state.presetId] = clampNum(stats.presets[state.presetId], 0, 1e7, 0) + 0.5;
  }
  bumpStreak(stats);
  saveStats(stats);
  renderStats(stats);
}, 30000);

/* ================= Экспорт / импорт данных ================= */

function exportData() {
  const data = {};
  EXPORT_SUFFIXES.forEach((sfx) => {
    const v = storage.get(sfx, undefined);
    if (v !== undefined) data[sfx] = v;
  });
  const themeVal = rawStorage.get("meduk.theme.v2", undefined);
  if (themeVal !== undefined) data["theme.v2"] = themeVal;
  const payload = { app: "meduk-relax", version: 4, data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "meduk-relax-data.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("Файл с твоими данными ушёл в загрузки");
}

function importData(file) {
  if (file.size > 300000) {
    toast("Не похоже на файл Meduk Relax: он слишком большой");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      if (!payload || payload.app !== "meduk-relax" || !payload.data || typeof payload.data !== "object") {
        toast("Это не файл данных Meduk Relax");
        return;
      }
      const suffixes = Object.keys(payload.data).map((k) => (k.startsWith("meduk.") ? k.slice(6) : k));
      Object.entries(payload.data).forEach(([key, value]) => {
        const sfx = key.startsWith("meduk.") ? key.slice(6) : key;
        if (sfx === "theme.v1") {
          rawStorage.set("meduk.theme.v1", value);
        } else if (sfx === "mix.v1") {
          const mix = sanitizeMix(value);
          if (mix) storage.set(sfx, mix);
        } else if (sfx === "mixes.v1") {
          if (Array.isArray(value)) {
            const mixes = value
              .filter((m) => m && typeof m.name === "string" && m.data)
              .map((m) => ({ name: m.name.slice(0, 24), data: sanitizeMix(m.data) }))
              .filter((m) => m.data)
              .slice(0, 12);
            storage.set(sfx, mixes);
          }
        } else if (EXPORT_SUFFIXES.includes(sfx) || sfx === "stats.v2") {
          storage.set(sfx, value);
        }
      });
      /* Старый бэкап только со stats.v2: убираем свежий v3, чтобы сработала миграция */
      if (suffixes.includes("stats.v2") && !suffixes.includes("stats.v3")) {
        rawStorage.remove(dataKeyFor("stats.v3"));
      }
      toast("Данные загружены, страница обновится");
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast("Не получилось прочитать файл");
    }
  };
  reader.readAsText(file);
}

/* ================= Помодоро ================= */

const RING_LEN = 2 * Math.PI * 124;

const pomoSaved = storage.get("pomo.v2", {});
const pomo = {
  workMin: clampNum(pomoSaved.workMin, 5, 120, 25),
  breakMin: clampNum(pomoSaved.breakMin, 1, 60, 5),
  cycles: [2, 4, 6].includes(Number(pomoSaved.cycles)) ? Number(pomoSaved.cycles) : 4,
  autoSound: pomoSaved.autoSound !== false,
  phase: "idle", running: false, cycle: 1, endsAt: 0, remainMs: 0, snapshot: null,
};

function persistPomo() {
  storage.set("pomo.v2", {
    workMin: pomo.workMin, breakMin: pomo.breakMin,
    cycles: pomo.cycles, autoSound: pomo.autoSound,
  });
}

function syncPomoSettingsUI() {
  const workChip = $(`#workChips [data-work="${pomo.workMin}"]`);
  activate($("#workChips"), workChip);
  $("#workCustom").value = workChip ? "" : String(pomo.workMin);
  const breakChip = $(`#breakChips [data-break="${pomo.breakMin}"]`);
  activate($("#breakChips"), breakChip);
  $("#breakCustom").value = breakChip ? "" : String(pomo.breakMin);
  activate($("#cycleChips"), $(`#cycleChips [data-cycles="${pomo.cycles}"]`));
  $("#autoSoundToggle").checked = pomo.autoSound;
  renderPomoPlan();
}

function renderPomoPlan() {
  const total = pomo.cycles * pomo.workMin + (pomo.cycles - 1) * pomo.breakMin;
  const word = pomo.cycles === 6 ? "кругов" : "круга";
  $("#pomoPlan").textContent = `${pomo.cycles} ${word} по ${pomo.workMin} мин: с перерывами это ${fmtMin(total)}.`;
}

function pomoPhaseMs() {
  return (pomo.phase === "break" ? pomo.breakMin : pomo.workMin) * 60000;
}

function renderPomoDots() {
  const wrap = $("#pomoDots");
  if (wrap.children.length !== pomo.cycles) {
    wrap.innerHTML = "";
    for (let i = 0; i < pomo.cycles; i += 1) wrap.append(document.createElement("i"));
  }
  [...wrap.children].forEach((dot, i) => {
    const done = i < pomo.cycle - 1 || (i === pomo.cycle - 1 && pomo.phase === "break");
    dot.classList.toggle("is-done", done);
    dot.classList.toggle("is-now", pomo.phase !== "idle" && i === pomo.cycle - 1 && !done);
  });
}

function renderPomo() {
  const total = pomoPhaseMs();
  const left = pomo.running ? Math.max(0, pomo.endsAt - Date.now())
    : (pomo.phase === "idle" ? total : pomo.remainMs);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("#pomoTime").textContent = `${m}:${String(s).padStart(2, "0")}`;
  const phaseText =
    pomo.phase === "work" ? "Работа" :
    pomo.phase === "break" ? "Перерыв" :
    "Можно начинать";
  const phaseEl = $("#pomoPhase");
  /* role=status озвучивает изменения: пишем текст только когда фаза сменилась */
  if (phaseEl.textContent !== phaseText) phaseEl.textContent = phaseText;
  $("#pomoCycle").textContent = `круг ${pomo.cycle} из ${pomo.cycles}`;
  const progress = pomo.phase === "idle" ? 0 : 1 - left / total;
  $("#pomoRingFg").style.strokeDashoffset = String(RING_LEN * (1 - progress));
  $("#pomoStart").textContent = pomo.running ? "Пауза" : (pomo.phase === "idle" ? "Старт" : "Продолжить");
  $("#pomoSkip").hidden = pomo.phase === "idle";
  document.querySelector(".pomo-card").classList.toggle("is-break", pomo.phase === "break");
  renderPomoDots();

  const tip = $("#pomoTip");
  tip.hidden = pomo.phase !== "break";
}

function pomoEnterBreak(base = Date.now(), quiet = false) {
  pomo.phase = "break";
  pomo.endsAt = base + pomoPhaseMs();
  if (!quiet) MedukAudio.chime("single");
  $("#pomoTip").textContent = BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)];
  if (pomo.autoSound && state.playing) {
    pomo.snapshot = collectMix();
    applyMix(BREAK_MIX, { transient: true, asPreset: { id: "", name: "Перерыв", copy: "Мягкие волны, пока ты отдыхаешь." } });
  }
}

function pomoRestoreSnapshot() {
  if (!pomo.snapshot) return;
  applyMix(pomo.snapshot, {
    asPreset: { id: pomo.snapshot.presetId, name: pomo.snapshot.presetName, copy: pomo.snapshot.presetCopy },
  });
  pomo.snapshot = null;
}

function pomoEnterWork(base = Date.now(), quiet = false) {
  pomo.phase = "work";
  pomo.endsAt = base + pomoPhaseMs();
  if (!quiet) MedukAudio.chime("single");
  pomoRestoreSnapshot();
}

function pomoFinish() {
  pomo.running = false;
  pomo.phase = "idle";
  pomo.cycle = 1;
  pomoRestoreSnapshot();
  MedukAudio.chime("double");
  const stats = loadStats();
  stats.pomodoros += 1;
  saveStats(stats);
  renderStats(stats);
  toast("Все круги пройдены. Хорошая работа.");
}

function pomoTick() {
  if (!pomo.running) return;
  /* Фоновая вкладка троттлит таймеры: догоняем все пропущенные фазы без потери времени */
  let guard = 0;
  while (pomo.running && Date.now() >= pomo.endsAt && guard < 60) {
    guard += 1;
    const base = pomo.endsAt;
    const quiet = Date.now() - base > 2500;
    if (pomo.phase === "work") {
      if (pomo.cycle >= pomo.cycles) { pomoFinish(); break; }
      pomoEnterBreak(base, quiet);
    } else {
      pomo.cycle += 1;
      pomoEnterWork(base, quiet);
    }
  }
  renderPomo();
}

setInterval(pomoTick, 250);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pomoTick();
});

/* ================= Дыхание ================= */

const breathSaved = storage.get("breath.v1", {});
const breath = {
  technique: BREATH_TECHNIQUES[breathSaved.technique] ? breathSaved.technique : "478",
  running: false, timer: 0, countTimer: 0, step: 0, startedAt: 0,
};

const SCENE_PHASES = ["is-in", "is-out", "is-hold-in", "is-hold-out"];

function breathSetPhase(kind, seconds) {
  const scene = $("#breathScene");
  scene.style.setProperty("--phase-dur", `${seconds}s`);
  scene.classList.remove(...SCENE_PHASES);
  if (kind === "in") scene.classList.add("is-in");
  else if (kind === "out") scene.classList.add("is-out");
  else if (kind === "hold") scene.classList.add("is-hold-in");
  else scene.classList.add("is-hold-out");
}

function breathCountdown(seconds) {
  clearInterval(breath.countTimer);
  let count = seconds;
  const el = $("#breathCount");
  el.textContent = String(count);
  breath.countTimer = setInterval(() => {
    count -= 1;
    el.textContent = count > 0 ? String(count) : "";
    if (count <= 0) clearInterval(breath.countTimer);
  }, 1000);
}

function breathStop(labelText = "Начнём?") {
  const wasLong = breath.running && Date.now() - breath.startedAt >= 60000;
  breath.running = false;
  clearTimeout(breath.timer);
  clearInterval(breath.countTimer);
  const scene = $("#breathScene");
  scene.classList.remove(...SCENE_PHASES, "is-running");
  scene.style.setProperty("--phase-dur", "0.8s");
  $("#breathLabel").textContent = labelText;
  $("#breathCount").textContent = "";
  $("#breathStart").textContent = "Начать дыхание";
  if (wasLong) {
    const stats = loadStats();
    stats.breaths += 1;
    saveStats(stats);
    renderStats(stats);
  }
}

function breathStep() {
  const steps = BREATH_TECHNIQUES[breath.technique].steps;
  const [label, seconds, kind] = steps[breath.step % steps.length];
  $("#breathLabel").textContent = label;
  breathSetPhase(kind, seconds);
  breathCountdown(seconds);
  breath.step += 1;
  breath.timer = setTimeout(breathStep, seconds * 1000);
}

/* ================= Визуализация героя ================= */

const canvas = $("#waveCanvas");
const ctx2d = canvas.getContext("2d");
let waveA = "232, 196, 118";
let waveB = "96, 156, 176";

function refreshWaveColors() {
  const cs = getComputedStyle(document.documentElement);
  waveA = (cs.getPropertyValue("--wave-a") || waveA).trim();
  waveB = (cs.getPropertyValue("--wave-b") || waveB).trim();
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (reducedMotion) drawFrame(performance.now());
}

function drawFrame(time) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const cx = width * 0.66;
  const cy = height * 0.44;
  const baseRadius = Math.min(width, height) * 0.24;
  const energy = state.playing ? 1 : 0.35;

  ctx2d.clearRect(0, 0, width, height);
  ctx2d.save();

  for (let ring = 0; ring < 5; ring += 1) {
    const points = 180;
    const radius = baseRadius + ring * 30;
    ctx2d.beginPath();
    for (let i = 0; i <= points; i += 1) {
      const angle = (i / points) * Math.PI * 2;
      const beat = Math.sin(angle * (2 + ring) + time * 0.00045 + state.hz * 0.3);
      const breathe = Math.sin(time * 0.00028 + ring * 1.4) * 14;
      const r = radius + beat * 14 * energy + breathe * energy;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx2d.moveTo(x, y);
      else ctx2d.lineTo(x, y);
    }
    ctx2d.strokeStyle = `rgba(${waveA}, ${0.1 + ring * 0.02})`;
    ctx2d.lineWidth = 1 + ring * 0.2;
    ctx2d.stroke();
  }

  for (let line = 0; line < 6; line += 1) {
    const y = height * (0.3 + line * 0.09);
    ctx2d.beginPath();
    for (let x = -40; x <= width + 40; x += 10) {
      const wave = Math.sin(x * 0.014 + time * 0.0004 + line * 1.2) * (8 + line * 2) * energy;
      if (x === -40) ctx2d.moveTo(x, y + wave);
      else ctx2d.lineTo(x, y + wave);
    }
    ctx2d.strokeStyle = `rgba(${waveB}, ${0.04 + line * 0.012})`;
    ctx2d.lineWidth = 1;
    ctx2d.stroke();
  }

  ctx2d.restore();
  if (!reducedMotion) requestAnimationFrame(drawFrame);
}

/* ================= Появление секций ================= */

function setupReveal() {
  const items = $$(".reveal");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
}

/* ================= Навигация: scrollspy, прогресс, шапка ================= */

function setCurrentNav(id) {
  $$("[data-nav]").forEach((link) => {
    link.classList.toggle("is-current", link.dataset.nav === id);
  });
}

function setupNav() {
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setCurrentNav(entry.target.id);
      });
    }, { rootMargin: "-40% 0px -55%", threshold: 0 });
    NAV_SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  const progress = $("#scrollProgress");
  const topbar = $("#topbar");
  const toTop = $("#toTop");
  let lastY = window.scrollY;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${total > 0 ? Math.min(1, y / total) : 0})`;
    topbar.classList.toggle("is-scrolled", y > 8);
    toTop.classList.toggle("is-visible", y > window.innerHeight * 1.6);
    /* На узких экранах шапка прячется при скролле вниз и возвращается на скролле вверх */
    const narrow = window.innerWidth <= 680;
    if (narrow && y > 240 && y - lastY > 4) topbar.classList.add("is-hidden");
    else if (y < lastY - 4 || y <= 240 || !narrow) topbar.classList.remove("is-hidden");
    lastY = y;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  toTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });
}

/* ================= Экран блокировки и шторка уведомлений ================= */

function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* Строка под названием. Если идут и помодоро, и сон-таймер — показываем оба. */
function nowPlayingLine() {
  const parts = [];
  if (pomo.running) {
    const what = pomo.phase === "break" ? "перерыва" : "работы";
    parts.push(`До конца ${what} ${fmtClock(pomo.endsAt - Date.now())}`);
  }
  if (state.playing && state.sleepDeadline) {
    parts.push(`Выключение через ${fmtClock(state.sleepDeadline - Date.now())}`);
  }
  return parts.join(" · ");
}

function updateNowPlaying() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.presetName || "Meduk Relax",
      artist: nowPlayingLine() || state.presetCopy || "Звуковая комната",
      album: "Meduk Relax",
      artwork: [
        { src: "assets/icon-192.webp", sizes: "192x192", type: "image/webp" },
        { src: "assets/icon-512.webp", sizes: "512x512", type: "image/webp" },
      ],
    });

    /* Полоску отсчёта просим отсчитывать саму систему: в фоне браузер душит
       наши таймеры, и цифры, обновляемые из JS, просто застыли бы. */
    let total = 0;
    let done = 0;
    if (pomo.running) {
      total = pomoPhaseMs();
      done = total - Math.max(0, pomo.endsAt - Date.now());
    } else if (state.playing && state.sleepDeadline) {
      total = state.sleepMinutes * 60000;
      done = total - Math.max(0, state.sleepDeadline - Date.now());
    }
    if (total > 0 && navigator.mediaSession.setPositionState) {
      navigator.mediaSession.setPositionState({
        duration: total / 1000,
        position: Math.min(total, Math.max(0, done)) / 1000,
        playbackRate: state.playing ? 1 : 0,
      });
    }
  } catch (e) { /* браузер без MediaSession — не критично */ }
}

function wireMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const set = (action, fn) => {
    try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) { /* действие не поддержано */ }
  };
  set("play", () => togglePlay(true));
  set("pause", () => togglePlay(false));
  set("stop", () => togglePlay(false));
  setInterval(() => {
    if (state.playing || pomo.running) updateNowPlaying();
  }, 1000);
}

/* ================= Обработчики ================= */

function wire() {
  $("#playButton").addEventListener("click", () => togglePlay());
  $("#masterPlay").addEventListener("click", () => togglePlay());
  $("#tabPlay").addEventListener("click", () => togglePlay());

  $("#themeToggle").addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(next);
    toast(`Тема: ${THEME_NAMES[next]}`);
    track("theme", { v: next });
  });

  $("#catChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.cat = btn.dataset.cat;
    activate($("#catChips"), btn);
    buildPresetCards();
  });

  $("#modeSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    activate($("#modeSeg"), btn);
    markCustom();
    syncNowPlaying();
    pushBeat();
    persistMix();
  });

  $("#bandChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.band = btn.dataset.band;
    state.hz = BANDS[state.band].hz;
    markCustom();
    syncControls();
    pushBeat();
    persistMix();
  });

  $("#beatControl").addEventListener("input", (e) => {
    state.hz = Number(e.target.value);
    $("#beatOut").textContent = `${fmtHz(state.hz)} Гц`;
    markCustom();
    syncNowPlaying();
    pushBeat();
    persistMix();
  });

  $("#carrierControl").addEventListener("input", (e) => {
    state.carrier = Number(e.target.value);
    $("#carrierOut").textContent = `${state.carrier} Гц`;
    markCustom();
    syncNowPlaying();
    pushBeat();
    persistMix();
  });

  $("#beatLevel").addEventListener("input", (e) => {
    state.beatLevel = Number(e.target.value);
    $("#beatLevelOut").textContent = `${state.beatLevel}%`;
    markCustom();
    syncNowPlaying();
    pushBeat();
    persistMix();
  });

  $$(".layer").forEach((row) => {
    const name = row.dataset.layer;
    const slider = row.querySelector(".layer-level");
    const toggleBtn = row.querySelector(".layer-toggle");
    const previewBtn = row.querySelector(".layer-preview");
    const applyLayer = () => {
      row.classList.toggle("is-on", state.layers[name] > 0);
      toggleBtn.setAttribute("aria-pressed", String(state.layers[name] > 0));
      markCustom();
      syncNowPlaying();
      MedukAudio.setLayer(name, state.layers[name] / 100);
      persistMix();
    };
    slider.addEventListener("input", () => {
      endPreviewIfActive();
      state.layers[name] = Number(slider.value);
      applyLayer();
    });
    toggleBtn.addEventListener("click", () => {
      endPreviewIfActive();
      state.layers[name] = state.layers[name] > 0 ? 0 : 45;
      slider.value = state.layers[name];
      applyLayer();
      if (!state.playing && state.layers[name] > 0) togglePlay(true);
    });
    previewBtn.addEventListener("click", () => startPreview(previewBtn, name));
  });

  $("#noiseChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.noise.kind = btn.dataset.noise;
    activate($("#noiseChips"), btn);
    markCustom();
    syncNowPlaying();
    MedukAudio.setNoise(state.noise.kind, state.noise.level / 100);
    persistMix();
  });

  $("#noiseLevel").addEventListener("input", (e) => {
    state.noise.level = Number(e.target.value);
    $("#noiseLevelOut").textContent = `${state.noise.level}%`;
    MedukAudio.setNoise(state.noise.kind, state.noise.level / 100);
    persistMix();
  });

  $("#masterVolume").addEventListener("input", (e) => {
    state.master = Number(e.target.value);
    $("#masterOut").textContent = `${state.master}%`;
    MedukAudio.setMaster(state.master / 100);
    persistMix();
  });

  $("#sleepChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.sleepMinutes = Number(btn.dataset.minutes);
    activate($("#sleepChips"), btn);
    fadeStarted = false;
    if (state.playing && state.sleepMinutes > 0) {
      state.sleepDeadline = Date.now() + state.sleepMinutes * 60000;
    } else {
      state.sleepDeadline = 0;
      $("#sleepReadout").textContent = state.sleepMinutes > 0
        ? `Выключится через ${state.sleepMinutes} минут после старта.`
        : "Звук играет, пока не выключишь.";
    }
    /* Возвращаем громкость всегда: если шло финальное затухание, продление таймера его отменяет */
    MedukAudio.setMaster(state.master / 100);
    persistMix();
  });

  $("#saveMix").addEventListener("click", () => {
    const nameInput = $("#mixName");
    const name = nameInput.value.trim() || `Микс ${new Date().toLocaleDateString("ru-RU")}`;
    const mixes = loadMixes();
    if (mixes.length >= 12) {
      toast("Максимум 12 миксов. Удали что-нибудь старое.");
      return;
    }
    mixes.unshift({ name, data: collectMix() });
    storage.set("mixes.v1", mixes);
    nameInput.value = "";
    renderMixes();
    toast(`Микс «${name}» сохранён`);
  });

  /* Помодоро */
  $("#pomoStart").addEventListener("click", () => {
    if (pomo.running) {
      pomo.running = false;
      pomo.remainMs = Math.max(0, pomo.endsAt - Date.now());
    } else {
      if (pomo.phase === "idle") {
        pomo.phase = "work";
        pomo.cycle = 1;
        pomo.endsAt = Date.now() + pomoPhaseMs();
      } else {
        pomo.endsAt = Date.now() + pomo.remainMs;
      }
      pomo.running = true;
    }
    renderPomo();
  });

  $("#pomoSkip").addEventListener("click", () => {
    if (pomo.phase === "idle") return;
    const wasPaused = !pomo.running;
    pomo.running = true;
    pomo.endsAt = Date.now() - 1;
    pomoTick();
    /* Пропуск с паузы оставляет таймер на паузе в новой фазе */
    if (wasPaused && pomo.phase !== "idle") {
      pomo.running = false;
      pomo.remainMs = pomoPhaseMs();
      renderPomo();
    }
  });

  $("#pomoReset").addEventListener("click", () => {
    pomo.running = false;
    pomo.phase = "idle";
    pomo.cycle = 1;
    pomoRestoreSnapshot();
    renderPomo();
  });

  $("#workChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    pomo.workMin = Number(btn.dataset.work);
    syncPomoSettingsUI();
    persistPomo();
    if (pomo.phase === "idle") renderPomo();
  });
  $("#workCustom").addEventListener("change", (e) => {
    const v = clampNum(e.target.value, 5, 120, pomo.workMin);
    if (!e.target.value) return;
    pomo.workMin = Math.round(v);
    syncPomoSettingsUI();
    persistPomo();
    if (pomo.phase === "idle") renderPomo();
  });
  $("#breakChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    pomo.breakMin = Number(btn.dataset.break);
    syncPomoSettingsUI();
    persistPomo();
  });
  $("#breakCustom").addEventListener("change", (e) => {
    const v = clampNum(e.target.value, 1, 60, pomo.breakMin);
    if (!e.target.value) return;
    pomo.breakMin = Math.round(v);
    syncPomoSettingsUI();
    persistPomo();
  });
  $("#cycleChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    pomo.cycles = Number(btn.dataset.cycles);
    activate($("#cycleChips"), btn);
    persistPomo();
    renderPomoPlan();
    renderPomo();
  });
  $("#autoSoundToggle").addEventListener("change", (e) => {
    pomo.autoSound = e.target.checked;
    persistPomo();
  });

  /* Статистика */
  $("#rangeChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    statsRange = Number(btn.dataset.range) === 30 ? 30 : 7;
    activate($("#rangeChips"), btn);
    renderStats(loadStats());
  });

  /* Дыхание */
  $("#breathChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    breath.technique = btn.dataset.breath;
    storage.set("breath.v1", { technique: breath.technique });
    activate($("#breathChips"), btn);
    $("#breathDesc").textContent = BREATH_TECHNIQUES[breath.technique].desc;
    if (breath.running) { breath.step = 0; clearTimeout(breath.timer); breathStep(); }
  });

  $("#breathStart").addEventListener("click", () => {
    if (breath.running) {
      breathStop("Хорошая пауза.");
      return;
    }
    breath.running = true;
    breath.step = 0;
    breath.startedAt = Date.now();
    $("#breathStart").textContent = "Остановить";
    $("#breathScene").classList.add("is-running");
    breathStep();
  });

  /* Данные */
  $("#exportData").addEventListener("click", exportData);
  $("#importData").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });

  /* Поддержка */
  $$("[data-donate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = DONATE_LINKS[btn.dataset.donate];
      if (url) window.open(url, "_blank", "noopener");
      else $("#soonDialog").showModal();
    });
  });
  $("#soonClose").addEventListener("click", () => $("#soonDialog").close());
  wireDialogDismiss($("#soonDialog"));

  $("#shareBtn").addEventListener("click", async () => {
    const text = `Meduk Relax: бесплатная звуковая комната для фокуса и сна. ${TELEGRAM_URL}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Meduk Relax", text, url: TELEGRAM_URL });
      } else {
        await navigator.clipboard.writeText(text);
        toast("Текст со ссылкой скопирован");
      }
    } catch (e) { /* пользователь передумал */ }
  });

  /* Профиль и вход */
  $("#profileBtn").addEventListener("click", () => {
    if (currentUser) {
      openProfileDialog();
    } else {
      setAuthMode("login");
      $("#authDialog").showModal();
    }
  });

  $("#authTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    setAuthMode(btn.dataset.authtab);
  });
  $("#forgotBtn").addEventListener("click", () => setAuthMode("reset"));
  $("#authSwitchBtn").addEventListener("click", () => {
    setAuthMode(authMode === "register" ? "login" : "register");
  });
  $("#avatarRow").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    pickedAvatar = btn.dataset.avatar;
    activate($("#avatarRow"), btn);
  });
  $("#authForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleAuthSubmit();
  });
  $("#authClose").addEventListener("click", () => $("#authDialog").close());
  wireDialogDismiss($("#authDialog"));

  $("#profClose").addEventListener("click", () => $("#profileDialog").close());
  wireDialogDismiss($("#profileDialog"));
  $("#profExport").addEventListener("click", exportData);
  $("#profLogout").addEventListener("click", logout);
  $("#profDelete").addEventListener("click", () => {
    if (!deleteArmed) {
      deleteArmed = true;
      $("#profDelete").textContent = "Точно удалить? Миксы и вся статистика пропадут. Нажми ещё раз.";
      return;
    }
    deleteProfile();
  });

  /* Клавиатура: пробел = плей/пауза (после первого запуска звука) */
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    if (!MedukAudio.ready) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (["INPUT", "TEXTAREA", "BUTTON", "SELECT", "SUMMARY", "A"].includes(tag)) return;
    if ($("#soonDialog").open || $("#authDialog").open || $("#profileDialog").open) return;
    e.preventDefault();
    togglePlay();
  });

  window.addEventListener("resize", resizeCanvas);
  $("#shareMix").addEventListener("click", shareMix);
}

/* ================= Поделиться миксом ================= */

function shareUrl() {
  return location.origin + location.pathname + "#mix=" + mixToCode(collectMix());
}

function copyToClipboard(text) {
  /* Старый способ через временное поле: он работает и там, где браузер
     не даёт доступ к буферу напрямую. */
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

async function shareMix() {
  const url = shareUrl();
  track("share", { what: "mix" });
  /* На телефоне открываем системное «Поделиться», на компьютере кладём в буфер */
  if (navigator.share) {
    try {
      await navigator.share({ title: "Meduk Relax", text: "Мой звук для фокуса, попробуй", url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // человек передумал, это не ошибка
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка на твой микс скопирована.");
    return;
  } catch (e) { /* доступа к буферу нет, пробуем по-старому */ }
  toast(copyToClipboard(url) ? "Ссылка на твой микс скопирована." : "Не вышло скопировать ссылку.");
}

/* ================= Установка как приложение ================= */

let installPrompt = null;

function wireInstall() {
  const btn = $("#installBtn");
  if (!btn) return;
  /* Кнопку показываем только когда браузер сам сообщил, что сайт можно
     поставить на домашний экран. До этого нажимать было бы не на что. */
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    if (!rawStorage.get("meduk.installHidden.v1", false)) btn.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (!installPrompt) return;
    btn.hidden = true;
    installPrompt.prompt();
    const res = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    const outcome = res && res.outcome ? res.outcome : "unknown";
    track("install", { result: outcome });
    if (outcome === "accepted") {
      toast("Готово: Meduk Relax теперь на твоём экране.");
    } else {
      rawStorage.set("meduk.installHidden.v1", true); // отказался — больше не пристаём
    }
  });
  window.addEventListener("appinstalled", () => {
    btn.hidden = true;
    rawStorage.set("meduk.installHidden.v1", true);
  });
}

/* ================= Сколько времени слушают ================= */

/* Время копим только пока звук реально идёт. Отправляем при паузе и при уходе
   со страницы, а долгие сессии дробим: закрытая вкладка иначе унесёт всё разом. */
let listenFrom = 0;
let listenDebt = 0;

function listenTick() {
  if (!listenFrom) return;
  const now = Date.now();
  listenDebt += now - listenFrom;
  listenFrom = now;
}

function listenFlush() {
  listenTick();
  const sec = Math.round(listenDebt / 1000);
  listenDebt = 0;
  if (sec >= 5) track("listen", { sec: String(sec) }); // совсем короткие тычки не считаем
}

function listenStart() {
  if (!listenFrom) listenFrom = Date.now();
}

function listenStop() {
  listenTick();
  listenFrom = 0;
  listenFlush();
}

function wireListen() {
  setInterval(() => { if (listenFrom) listenFlush(); }, 300000);
  window.addEventListener("pagehide", listenFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") listenFlush();
  });
}

/* ================= Старт ================= */

applyTheme(theme);
buildPresetCards();
syncControls();
syncPomoSettingsUI();
renderMixes();
renderStats(loadStats());
renderPomo();
$("#breathDesc").textContent = BREATH_TECHNIQUES[breath.technique].desc;
activate($("#breathChips"), $(`#breathChips [data-breath="${breath.technique}"]`));
syncProfileUI();
wire();
setupReveal();
setupNav();
resizeCanvas();
refreshWaveColors();
wireMediaSession();
wireInstall();
wireListen();
wireAnalyticsConsent();

if (reducedMotion) {
  drawFrame(performance.now());
} else {
  requestAnimationFrame(drawFrame);
}

const serviceWorkerOriginAllowed = window.location.protocol === "https:"
  || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
if ("serviceWorker" in navigator && serviceWorkerOriginAllowed) {
  /* updateViaCache: "none" — проверять обновление сайта только у сервера.
     Иначе браузер сверяется с собственной кэшированной копией и не узнаёт,
     что вышла новая версия. */
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .catch(() => { /* кэш опционален */ });
}
