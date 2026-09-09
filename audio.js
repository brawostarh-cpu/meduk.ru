"use strict";

/*
 * MedukAudio: синтез всего звука через Web Audio API.
 * Ничего не скачивается: ритмы, шум и атмосферы генерируются на лету.
 * Граф: [каналы] -> master(Gain) -> limiter(Compressor) -> destination
 */
const MedukAudio = (() => {
  let ctx = null;
  let nodes = null;
  let playing = false;
  let masterLevel = 0.4;
  let suspendTimer = 0;
  let keeper = null;
  const schedulers = [];

  const FADE = 0.6;

  /* На iPhone и iPad Safari усыпляет Web Audio при блокировке экрана, и приём
     с беззвучной петлёй там ничего не даёт — поэтому отличаем эти устройства. */
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  /* Главная причина «на айфоне не играет»: боковой переключатель «без звука».
     Обычный Web Audio попадает в категорию, которую этот переключатель глушит.
     Категория playback снимает ограничение (Safari 16.4 и новее). */
  function claimAudioSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch (e) { /* браузер не умеет — не страшно */ }
  }

  /* Секунда тишины в WAV. Нужна не для звука, а чтобы у страницы было
     «настоящее» медиа: только тогда система оставляет вкладку играть с
     погашенным экраном и показывает управление на локскрине. */
  function silentWavUrl() {
    const rate = 8000;
    const samples = rate;
    const buf = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buf);
    const text = (off, s) => { for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i)); };

    text(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples * 2, true);

    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  function startKeeper() {
    if (IS_IOS) return;
    try {
      if (!keeper) {
        keeper = new Audio(silentWavUrl());
        keeper.loop = true;
        keeper.volume = 0.001; // ровно ноль браузер счёл бы «неслышимым» и усыпил вкладку
        keeper.setAttribute("aria-hidden", "true");
        document.body.append(keeper); // в документе система ведёт себя предсказуемее
      }
      const p = keeper.play();
      if (p && p.catch) p.catch(() => { /* без жеста не пустит */ });
    } catch (e) { /* фоновое воспроизведение не критично */ }
  }

  function stopKeeper() {
    try { if (keeper) keeper.pause(); } catch (e) { /* уже остановлен */ }
  }

  /* ---------- буферы шума ---------- */

  function noiseBuffer(kind) {
    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (kind === "white") {
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } else if (kind === "pink") {
      // Метод Пола Келлета
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i += 1) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      // brown
      let last = 0;
      for (let i = 0; i < len; i += 1) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.2;
      }
    }
    return buffer;
  }

  function noiseSource(kind) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(kind);
    src.loop = true;
    src.start();
    return src;
  }

  function lfo(freq, depth, param, base) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = freq;
    amp.gain.value = depth;
    osc.connect(amp);
    amp.connect(param);
    if (base !== undefined) param.value = base;
    osc.start();
    return { osc, amp };
  }

  function ramp(param, value, dur = 0.12) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + dur);
  }

  /* ---------- атмосферные слои ---------- */

  function buildRain(master) {
    const body = noiseSource("white");
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 420;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const patter = noiseSource("white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4800;
    bp.Q.value = 0.7;
    const patterGain = ctx.createGain();
    patterGain.gain.value = 0.25;

    body.connect(hp); hp.connect(lp); lp.connect(gain);
    patter.connect(bp); bp.connect(patterGain); patterGain.connect(gain);
    gain.connect(master);

    // лёгкая неровность ливня
    schedulers.push(setInterval(() => {
      if (!playing) return;
      const t = ctx.currentTime;
      patterGain.gain.setTargetAtTime(0.16 + Math.random() * 0.22, t, 0.9);
      lp.frequency.setTargetAtTime(2200 + Math.random() * 900, t, 1.4);
    }, 2400));

    return { gain, trim: 0.5 };
  }

  function buildOcean(master) {
    const src = noiseSource("brown");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 460;
    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(lp); lp.connect(swell); swell.connect(gain); gain.connect(master);

    lfo(0.08, 0.4, swell.gain, 0.55);        // накат волн
    lfo(0.047, 170, lp.frequency, 460);      // «дыхание» тембра

    return { gain, trim: 1.15 };
  }

  function buildFire(master) {
    const rumbleSrc = noiseSource("brown");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const rumble = ctx.createGain();
    rumble.gain.value = 0.5;

    const crackSrc = noiseSource("white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 1.1;
    const crackle = ctx.createGain();
    crackle.gain.value = 0;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    rumbleSrc.connect(lp); lp.connect(rumble); rumble.connect(gain);
    crackSrc.connect(bp); bp.connect(crackle); crackle.connect(gain);
    gain.connect(master);

    // случайные щелчки-искры
    let crackleTimer = 0;
    const scheduleCrackle = () => {
      crackleTimer = setTimeout(() => {
        if (playing && gain.gain.value > 0.001) {
          const t = ctx.currentTime;
          const peak = 0.25 + Math.random() * 0.85;
          crackle.gain.cancelScheduledValues(t);
          crackle.gain.setValueAtTime(crackle.gain.value, t);
          crackle.gain.linearRampToValueAtTime(peak, t + 0.008);
          crackle.gain.exponentialRampToValueAtTime(0.001, t + 0.07 + Math.random() * 0.08);
          bp.frequency.setValueAtTime(1800 + Math.random() * 2600, t);
        }
        scheduleCrackle();
      }, 70 + Math.random() * 320);
    };
    scheduleCrackle();
    schedulers.push({ clear: () => clearTimeout(crackleTimer) });

    return { gain, trim: 0.85 };
  }

  function buildWind(master) {
    const src = noiseSource("pink");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 0.45;
    const sway = ctx.createGain();
    sway.gain.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(bp); bp.connect(sway); sway.connect(gain); gain.connect(master);

    lfo(0.06, 0.28, sway.gain, 0.6);
    schedulers.push(setInterval(() => {
      if (!playing) return;
      bp.frequency.setTargetAtTime(320 + Math.random() * 640, ctx.currentTime, 2.8);
    }, 3600));

    return { gain, trim: 0.95 };
  }

  function buildStream(master) {
    const a = noiseSource("white");
    const bpA = ctx.createBiquadFilter();
    bpA.type = "bandpass";
    bpA.frequency.value = 1250;
    bpA.Q.value = 0.9;
    const gA = ctx.createGain();
    gA.gain.value = 0.7;

    const b = noiseSource("white");
    const bpB = ctx.createBiquadFilter();
    bpB.type = "bandpass";
    bpB.frequency.value = 2700;
    bpB.Q.value = 1.3;
    const gB = ctx.createGain();
    gB.gain.value = 0.3;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    a.connect(bpA); bpA.connect(gA); gA.connect(gain);
    b.connect(bpB); bpB.connect(gB); gB.connect(gain);
    gain.connect(master);

    lfo(1.7, 0.16, gA.gain, 0.7);   // журчание
    lfo(0.9, 0.1, gB.gain, 0.3);

    return { gain, trim: 0.55 };
  }

  /* Ночь: «постель» из стрекота насекомых. Узкий резонанс на высокой частоте
     плюс быстрый тремоло дают знакомый звенящий стрёкот; второй слой — дальше. */
  function buildNight(master) {
    const src = noiseSource("white");
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4800;
    bp.Q.value = 12;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    lfo(24, 0.5, trem.gain, 0.5);
    const bed = ctx.createGain();
    bed.gain.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(bp); bp.connect(trem); trem.connect(bed); bed.connect(gain);
    gain.connect(master);

    const src2 = noiseSource("pink");
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 6300;
    bp2.Q.value = 8;
    const trem2 = ctx.createGain();
    trem2.gain.value = 0.4;
    lfo(31, 0.4, trem2.gain, 0.4);
    const far = ctx.createGain();
    far.gain.value = 0.26;
    src2.connect(bp2); bp2.connect(trem2); trem2.connect(far); far.connect(gain);

    // живость: стрёкот медленно гуляет по громкости и высоте
    schedulers.push(setInterval(() => {
      if (!playing) return;
      const t = ctx.currentTime;
      bed.gain.setTargetAtTime(0.34 + Math.random() * 0.3, t, 1.6);
      bp.frequency.setTargetAtTime(4400 + Math.random() * 900, t, 2.2);
    }, 2600));

    return { gain, trim: 0.5 };
  }

  /* Перезвон: редкие мягкие колокольчики по пентатонике (нет «неправильных»
     интервалов), долгий спад. Сквозь реверб звучит как ветряные колокольчики. */
  function buildChimes(master) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    const scale = [329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99];
    let timer = 0;
    const strike = () => {
      if (playing && gain.gain.value > 0.001) {
        const t = ctx.currentTime;
        const root = scale[Math.floor(Math.random() * scale.length)];
        [[1, 0.5], [2.01, 0.22], [3.02, 0.12]].forEach(([mult, amp]) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = root * mult;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(amp, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6 + Math.random() * 1.8);
          osc.connect(g); g.connect(gain);
          osc.start(t); osc.stop(t + 5);
        });
      }
      timer = setTimeout(strike, 1400 + Math.random() * 2600);
    };
    strike();
    schedulers.push({ clear: () => clearTimeout(timer) });

    return { gain, trim: 0.7 };
  }

  /* Импульсный отклик для реверба: затухающий шум. Генерируется на лету,
     никаких файлов — комнатный «воздух» для атмосферных слоёв. */
  function makeImpulse(seconds, decay) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /* ---------- инициализация графа ---------- */

  function init() {
    if (ctx) return;
    claimAudioSession();
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    const master = ctx.createGain();
    master.gain.value = 0;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -20;
    limiter.knee.value = 24;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    master.connect(limiter);
    limiter.connect(ctx.destination);

    /* Бинауральный ритм: два тона, по одному в каждое ухо */
    const merger = ctx.createChannelMerger(2);
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    const gL = ctx.createGain();
    const gR = ctx.createGain();
    oscL.type = "sine";
    oscR.type = "sine";
    gL.gain.value = 0.5;
    gR.gain.value = 0.5;
    oscL.connect(gL); gL.connect(merger, 0, 0);
    oscR.connect(gR); gR.connect(merger, 0, 1);
    const binauralGain = ctx.createGain();
    binauralGain.gain.value = 0;
    merger.connect(binauralGain);
    binauralGain.connect(master);
    oscL.start();
    oscR.start();

    /* Изохронный ритм: один тон пульсирует */
    const isoOsc = ctx.createOscillator();
    isoOsc.type = "sine";
    const isoTrem = ctx.createGain();
    isoTrem.gain.value = 0.5;
    const isoLfo = lfo(14, 0.5, isoTrem.gain, 0.5);
    const isoGain = ctx.createGain();
    isoGain.gain.value = 0;
    isoOsc.connect(isoTrem);
    isoTrem.connect(isoGain);
    isoGain.connect(master);
    isoOsc.start();

    const beatBus = ctx.createGain();
    beatBus.gain.value = 0.45;
    binauralGain.disconnect();
    isoGain.disconnect();
    binauralGain.connect(beatBus);
    isoGain.connect(beatBus);
    beatBus.connect(master);

    /* Шум */
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseGain.connect(master);

    /* Реверб: общий «воздух» для атмосфер. Ритм и шум остаются сухими —
       бинауральному биению важна точная разница между левым и правым ухом. */
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(2.2, 2.8);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.85;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.2;
    reverbSend.connect(reverb);
    reverb.connect(reverbReturn);
    reverbReturn.connect(master);

    const layers = {
      rain: buildRain(master),
      ocean: buildOcean(master),
      fire: buildFire(master),
      wind: buildWind(master),
      stream: buildStream(master),
      night: buildNight(master),
      chimes: buildChimes(master),
    };
    // сухой сигнал уже идёт в master; сюда — только влажная копия в реверб
    Object.values(layers).forEach((l) => l.gain.connect(reverbSend));

    nodes = {
      master, limiter,
      oscL, oscR, binauralGain,
      isoOsc, isoTrem, isoLfo, isoGain,
      beatBus,
      noiseGain, noiseSrc: null, noiseKind: "off",
      reverb, reverbSend, reverbReturn,
      layers,
    };
  }

  /* ---------- публичное API ---------- */

  async function resume() {
    init();
    clearTimeout(suspendTimer);
    if (ctx.state === "suspended") await ctx.resume();
  }

  async function setPlaying(next) {
    await resume();
    playing = next;
    if (next) {
      startKeeper();
      ramp(nodes.master.gain, masterLevel, FADE);
    } else {
      stopKeeper();
      ramp(nodes.master.gain, 0, 0.45);
      suspendTimer = setTimeout(() => {
        if (!playing && ctx && ctx.state === "running") ctx.suspend();
      }, 900);
    }
  }

  function setMaster(v, dur = 0.15) {
    masterLevel = v;
    if (nodes && playing) ramp(nodes.master.gain, v, dur);
  }

  function setBeat({ mode, hz, carrier, level }) {
    if (!nodes) return;
    const half = hz / 2;
    ramp(nodes.oscL.frequency, Math.max(30, carrier - half));
    ramp(nodes.oscR.frequency, carrier + half);
    ramp(nodes.isoOsc.frequency, carrier);
    ramp(nodes.isoLfo.osc.frequency, hz);
    ramp(nodes.beatBus.gain, level);
    ramp(nodes.binauralGain.gain, mode === "binaural" ? 1 : 0, 0.3);
    ramp(nodes.isoGain.gain, mode === "isochronic" ? 1 : 0, 0.3);
  }

  function setLayer(name, level) {
    if (!nodes) return;
    const layer = nodes.layers[name];
    if (layer) ramp(layer.gain.gain, level * layer.trim, 0.25);
  }

  function setNoise(kind, level) {
    if (!nodes) return;
    if (kind !== nodes.noiseKind) {
      if (nodes.noiseSrc) {
        try { nodes.noiseSrc.stop(); } catch (e) { /* уже остановлен */ }
        nodes.noiseSrc = null;
      }
      if (kind !== "off") {
        nodes.noiseSrc = noiseSource(kind);
        nodes.noiseSrc.connect(nodes.noiseGain);
      }
      nodes.noiseKind = kind;
    }
    ramp(nodes.noiseGain.gain, kind === "off" ? 0 : level * 0.4, 0.25);
  }

  /* Соло-прослушивание одного слоя атмосферы: кнопки «послушать» в студии.
     Глушит всё остальное; восстановление микса делает app.js через pushAll(). */
  async function previewLayer(name, level = 0.55) {
    init();
    await resume();
    const layer = nodes.layers[name];
    if (!layer) return;
    playing = true;
    clearTimeout(suspendTimer);
    Object.entries(nodes.layers).forEach(([key, l]) => {
      ramp(l.gain.gain, key === name ? level * l.trim : 0, 0.2);
    });
    ramp(nodes.beatBus.gain, 0, 0.2);
    ramp(nodes.noiseGain.gain, 0, 0.2);
    ramp(nodes.master.gain, Math.max(masterLevel, 0.3), 0.25);
  }

  /* Мягкий колокол для помодоро */
  async function chime(kind = "single") {
    init();
    clearTimeout(suspendTimer);
    /* Вне пользовательского жеста resume() может зависнуть (Safari/iOS): ждём не дольше 400 мс */
    try {
      if (ctx.state === "suspended") {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
      }
    } catch (e) { /* браузер не разрешил звук без жеста */ }
    if (ctx.state !== "running") return;
    const t0 = ctx.currentTime + 0.02;
    const strikes = kind === "double" ? [0, 0.7] : [0];
    strikes.forEach((offset) => {
      [523.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const peak = 0.16 / (i + 1);
        const t = t0 + offset;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 1.9);
        osc.connect(g);
        g.connect(nodes.limiter);
        osc.start(t);
        osc.stop(t + 2);
      });
    });
    if (!playing) {
      clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => {
        if (!playing && ctx && ctx.state === "running") ctx.suspend();
      }, (strikes.length > 1 ? 2900 : 2200));
    }
  }

  return {
    setPlaying, setMaster, setBeat, setLayer, setNoise, chime, previewLayer,
    get isPlaying() { return playing; },
    get ready() { return Boolean(ctx); },
    get isIOS() { return IS_IOS; },
    get state() { return ctx ? ctx.state : "none"; },
  };
})();
