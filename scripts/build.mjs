// Validates content/ and bundles it into public/content.json for the page.
// Exits non-zero with a list of problems if any file is malformed, so a bad
// generated file fails CI and the deploy instead of breaking the site.
//
// Layout:
//   content/<chapter>/chapter.json   { id, title, topics: [ordered topic names] }
//   content/<chapter>/<conceptId>.json
//   content/quizzes/<YYYY-MM-DD>.json { date, questions: [{ concept, question, options, correct, explanation }] }
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content");
const OUT = join(ROOT, "public", "content.json");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    err(file, `invalid JSON (${e.message})`);
    return null;
  }
}

function checkQuestion(file, q, where, needConcept) {
  if (!q || typeof q !== "object") return err(file, `${where} is not an object`);
  if (needConcept && !isStr(q.concept)) err(file, `${where}.concept missing`);
  if (!isStr(q.question)) err(file, `${where}.question missing`);
  if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isStr))
    err(file, `${where}.options must be 2+ non-empty strings`);
  else if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length)
    err(file, `${where}.correct must be an index into options`);
  if (!isStr(q.explanation)) err(file, `${where}.explanation missing`);
}

const chapters = [];
const concepts = [];
const seen = new Map();

for (const dir of readdirSync(CONTENT).sort()) {
  const path = join(CONTENT, dir);
  if (dir === "quizzes" || !statSync(path).isDirectory()) continue;
  const chFile = join(path, "chapter.json");
  if (!existsSync(chFile)) {
    err(path, "missing chapter.json");
    continue;
  }
  const ch = readJson(chFile);
  if (!ch) continue;
  if (ch.id !== dir) err(chFile, `id "${ch.id}" must match folder name "${dir}"`);
  if (!isStr(ch.title)) err(chFile, "title missing");
  if (!isStrArr(ch.topics)) err(chFile, "topics must be a non-empty list of names");
  const topics = Array.isArray(ch.topics) ? ch.topics : [];
  chapters.push({ id: dir, title: ch.title, topics });

  for (const name of readdirSync(path).sort()) {
    if (name === "chapter.json" || !name.endsWith(".json")) continue;
    const file = join(path, name);
    const c = readJson(file);
    if (!c) continue;
    if (!ID.test(c.id || "")) err(file, "id must be lowercase letters, digits and dashes");
    else if (c.id !== basename(name, ".json")) err(file, `id "${c.id}" must match file name`);
    if (seen.has(c.id)) err(file, `duplicate id "${c.id}" (also in ${seen.get(c.id)})`);
    seen.set(c.id, file);
    if (!topics.includes(c.topic)) err(file, `topic "${c.topic}" is not listed in ${dir}/chapter.json`);
    if (!isStr(c.title)) err(file, "title missing");
    if (!DATE.test(c.added || "")) err(file, "added must be YYYY-MM-DD");
    if (c.order !== undefined && !Number.isFinite(c.order)) err(file, "order must be a number");
    if (!isStrArr(c.points)) err(file, "points must be a non-empty list of strings");
    for (const k of ["trade", "code"]) if (c[k] !== undefined && typeof c[k] !== "string") err(file, `${k} must be a string`);
    if (!isStr(c.test)) err(file, "test (self-test question) missing");
    if (!isStr(c.answer)) err(file, "answer missing");
    if (!Array.isArray(c.questions)) err(file, "questions must be a list (can be empty)");
    else c.questions.forEach((q, i) => checkQuestion(file, q, `questions[${i}]`, false));
    concepts.push({ ...c, chapter: dir, questions: Array.isArray(c.questions) ? c.questions : [] });
  }
}

const quizzes = [];
const qdir = join(CONTENT, "quizzes");
if (existsSync(qdir)) {
  for (const name of readdirSync(qdir).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = join(qdir, name);
    const z = readJson(file);
    if (!z) continue;
    if (!DATE.test(z.date || "") || z.date !== basename(name, ".json")) err(file, "date must be YYYY-MM-DD and match the file name");
    if (!Array.isArray(z.questions) || z.questions.length === 0) err(file, "questions must be a non-empty list");
    else
      z.questions.forEach((q, i) => {
        checkQuestion(file, q, `questions[${i}]`, true);
        if (isStr(q.concept) && !seen.has(q.concept)) err(file, `questions[${i}].concept "${q.concept}" does not exist`);
      });
    quizzes.push(z);
  }
}

if (!concepts.length) errors.push("content/: no concepts found");

if (errors.length) {
  console.error(`Content check failed (${errors.length} problem${errors.length > 1 ? "s" : ""}):`);
  for (const e of errors) console.error("  " + e.replace(ROOT, ""));
  process.exit(1);
}

// Sort: chapter order (folder name), then topic order in chapter.json, then `order`, then title.
const topicRank = (c) => chapters.find((ch) => ch.id === c.chapter).topics.indexOf(c.topic);
concepts.sort(
  (a, b) =>
    a.chapter.localeCompare(b.chapter) ||
    topicRank(a) - topicRank(b) ||
    (a.order ?? 999) - (b.order ?? 999) ||
    a.title.localeCompare(b.title)
);
for (const c of concepts) delete c.order;

writeFileSync(OUT, JSON.stringify({ chapters, concepts, quizzes }));
const nq = concepts.reduce((n, c) => n + c.questions.length, 0);
console.log(`content.json: ${chapters.length} chapter(s), ${concepts.length} concepts, ${nq} questions, ${quizzes.length} generated quiz(zes)`);
