#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "content", "drafts");
const forbidden = [
  /\bлечит\b/i, /\bвылечит\b/i, /\bлечени[ея]\b/i,
  /\bтерапия\b/i, /\bтерапевтическ/i, /\bизбавляет от\b/i,
  /\bэффективнее лекарств\b/i, /\b100\s*%/i,
];
const required = ["## Практический вопрос", "## Что известно", "## Чего не знаем", "## Что это не значит", "## Источники"];
const errors = [];
if (!existsSync(dir)) errors.push("content/drafts directory is missing");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
if (files.length !== 6) errors.push(`expected 6 draft articles, found ${files.length}`);
for (const file of files) {
  const path = join(dir, file);
  const text = readFileSync(path, "utf8");
  for (const pattern of forbidden) if (pattern.test(text)) errors.push(`${file}: forbidden wording ${pattern}`);
  for (const heading of required) if (!text.includes(heading)) errors.push(`${file}: missing section ${heading}`);
  const urls = [...text.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]);
  if (urls.length < 2) errors.push(`${file}: fewer than two source links`);
  if (!/^status:\s*draft\s*$/m.test(text)) errors.push(`${file}: article must remain status: draft`);
}
if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}
console.log(`OK content: ${files.length} unpublished drafts passed structure and copy checks`);
