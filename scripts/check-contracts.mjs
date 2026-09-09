#!/usr/bin/env node
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const errors = [];
const check = (value, message) => { if (!value) errors.push(message); };

const html = read("index.html");
const audio = read("audio.js");
const app = read("app.js");
const sw = read("sw.js");

// C0: the audio engine must not know about subscription state.
check(!/premium|subscription|paywall|meduk\+/i.test(audio), "C0/C1: audio.js contains a premium/subscription branch");
for (const id of ["playButton", "presetGrid", "mixer", "pomoStart", "breathStart"]) {
  check(html.includes(`id=\"${id}\"`) || html.includes(`id='${id}'`), `C0: missing free control ${id}`);
}

// C1: premium must stay a separate, lazy UI concern if added later.
check(!html.includes("premium.js"), "C1: premium.js must be lazy-loaded, not part of the initial page");

// C3: private endpoints must never enter the offline cache.
check(/endsWith\("\.php"\)/.test(sw), "C3: service worker does not exclude PHP endpoints");
check(/indexOf\("\/admin"\)/.test(sw), "C3: service worker does not exclude /admin");

// C5: calendar output remains in the application and carries the required ICS envelope.
check(/BEGIN:VCALENDAR/.test(app), "C5: missing BEGIN:VCALENDAR");
check(/END:VCALENDAR/.test(app), "C5: missing END:VCALENDAR");
check(/DTSTART/.test(app) && /DTEND/.test(app), "C5: missing DTSTART/DTEND");
check(/escape|ics|calendar/i.test(app), "C5: calendar export implementation not found");

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}
console.log("OK contracts: C0 free audio, C1 separation, C3 offline boundaries and C5 calendar markers");
