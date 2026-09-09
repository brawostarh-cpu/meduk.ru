#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const errors = [];
const warnings = [];
const exists = (path) => existsSync(join(root, path));
const read = (path) => readFileSync(join(root, path), "utf8");

function fail(message) { errors.push(message); }
function check(condition, message) { if (!condition) fail(message); }

// The repository must remain directly deployable: source paths and public paths match.
for (const file of ["index.html", "404.html", "manifest.webmanifest", "sw.js", "app.js", "audio.js", "stats.js", "styles.css"]) {
  check(exists(file), `missing required file: ${file}`);
}

const sources = ["index.html", "404.html", "manifest.webmanifest", "sw.js", "app.js", "audio.js", "stats.js", "styles.css"]
  .filter(exists).map(read).join("\n");
const refs = new Set();
for (const match of sources.matchAll(/(?:^|["'(\s])((?:assets|admin)\/[A-Za-z0-9_.\-/]+)/g)) refs.add(match[1]);
for (const ref of refs) {
  if (ref.endsWith("/")) continue;
  check(exists(ref), `missing referenced asset: ${ref}`);
}

check(exists("admin/index.php"), "missing admin/index.php");
check(exists("admin/lib.php"), "missing admin/lib.php");
check(exists("admin/.htaccess"), "missing admin/.htaccess");
check(exists("assets/fonts"), "missing assets/fonts directory");

const manifest = JSON.parse(read("manifest.webmanifest"));
check(manifest.name === "Meduk Relax", "manifest name changed unexpectedly");
check(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest has no icons");
for (const icon of manifest.icons ?? []) check(exists(icon.src), `manifest icon missing: ${icon.src}`);

const sw = read("sw.js");
const versions = [...new Set([...sources.matchAll(/[?&]v=(\d+)/g)].map((m) => m[1]))];
if (versions.length > 1) fail(`static asset versions disagree: ${versions.join(", ")}`);
const cacheVersion = sw.match(/meduk-relax-v(\d+)/)?.[1];
if (versions.length === 1 && cacheVersion && versions[0] !== cacheVersion) {
  fail(`service-worker cache v${cacheVersion} disagrees with URL v${versions[0]}`);
}

for (const file of ["app.js", "audio.js", "stats.js", "sw.js", "theme-init.js"]) {
  try { execFileSync("node", ["--check", file], { cwd: root, stdio: "pipe" }); }
  catch { fail(`JavaScript syntax check failed: ${file}`); }
}

const phpFiles = ["collect.php", "pulse.php", ...readdirSync(join(root, "admin")).filter((file) => file.endsWith(".php")).map((file) => join("admin", file))];
try {
  execFileSync("php", ["-v"], { cwd: root, stdio: "ignore" });
  for (const file of phpFiles) {
    try { execFileSync("php", ["-l", file], { cwd: root, stdio: "pipe" }); }
    catch { fail(`PHP syntax check failed: ${file}`); }
  }
} catch {
  warnings.push("PHP is not installed; PHP syntax and HTTP checks were not run.");
}

if (exists(".meduk-data") || exists("meduk-data")) fail("runtime data directory must not be committed in the public tree");
if (sources.includes("127.0.0.1") || sources.includes("localhost")) warnings.push("local host reference found in browser-facing source; verify it is test-only");

for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);
if (errors.length) process.exit(1);
console.log(`OK ${relative(root, root) || "."}: ${refs.size} referenced paths, ${phpFiles.length} PHP files, JavaScript syntax valid`);
