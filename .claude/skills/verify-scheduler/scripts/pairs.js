#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness */
/*
 * pairs.js - check the README pairing rule against a drive's output.json.
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/pairs.js <evidence-dir-or-output.json> [--max-gap-days 7]
 *
 * Accepts the scheduler's output as groups `{ clinician: { id }, options: [{ first, second }] }[]`,
 * as an array of [session1, session2] tuples, or as a flat even-length array where consecutive
 * entries form one option. Each pair must be one clinician (and, for groups, the group's clinician),
 * on different UTC days, at most --max-gap-days apart (default 7). Writes pairs.json next to
 * output.json: every pair when there are at most 200, otherwise only the invalid ones (first
 * 1000) plus totals. Prints the first 20 invalid pairs and the totals. Exit 0 when every pair is
 * valid; 1 when any pair violates; 2 when the output is neither shape.
 */
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
let maxGap = 7;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--max-gap-days") {
    maxGap = Number(argv[i + 1]);
    i++;
  } else {
    positional.push(argv[i]);
  }
}
if (positional.length !== 1 || Number.isNaN(maxGap)) {
  console.error("usage: pairs.js <evidence-dir-or-output.json> [--max-gap-days N]");
  process.exit(2);
}

let outputPath = path.resolve(positional[0]);
if (fs.statSync(outputPath).isDirectory()) outputPath = path.join(outputPath, "output.json");
const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));

const isSlot = (s) => s && typeof s === "object" && typeof s.date === "string" && typeof s.clinicianId === "string";
const isOption = (o) => o && typeof o === "object" && isSlot(o.first) && isSlot(o.second);
const isGroup = (g) =>
  g && typeof g === "object" && g.clinician && typeof g.clinician.id === "string" && Array.isArray(g.options) && g.options.every(isOption);

// Each entry: [first, second, expectedClinicianId | null]
let options;
let shape;
if (Array.isArray(output) && output.every(isGroup)) {
  options = output.flatMap((g) => g.options.map((o) => [o.first, o.second, g.clinician.id]));
  shape = "groups";
} else if (Array.isArray(output) && output.every((o) => Array.isArray(o) && o.length === 2 && o.every(isSlot))) {
  options = output.map(([a, b]) => [a, b, null]);
  shape = "tuples";
} else if (Array.isArray(output) && output.length % 2 === 0 && output.every(isSlot)) {
  options = [];
  for (let i = 0; i < output.length; i += 2) options.push([output[i], output[i + 1], null]);
  shape = "flat";
} else {
  const got = Array.isArray(output) ? `array of ${output.length}` : typeof output;
  console.error(`NOT PAIRABLE: expected clinician groups, [slot, slot] tuples, or an even-length array of slots, got ${got}`);
  process.exit(2);
}

const utcMidnight = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const pairs = options.map(([a, b, groupClinicianId], index) => {
  const gapDays = Math.abs(utcMidnight(b.date) - utcMidnight(a.date)) / 86400000;
  const problems = [];
  if (a.clinicianId !== b.clinicianId) problems.push("different clinicians");
  if (groupClinicianId !== null && (a.clinicianId !== groupClinicianId || b.clinicianId !== groupClinicianId)) {
    problems.push(`slot clinician differs from group clinician ${groupClinicianId}`);
  }
  if (gapDays === 0) problems.push("same UTC day");
  if (gapDays > maxGap) problems.push(`${gapDays} days apart (max ${maxGap})`);
  return { index, first: a.date, second: b.date, clinicianId: a.clinicianId, gapDays, problems };
});

const invalidPairs = pairs.filter((p) => p.problems.length);
const invalid = invalidPairs.length;
const details = pairs.length <= 200 ? pairs : invalidPairs.slice(0, 1000);
const reportPath = path.join(path.dirname(outputPath), "pairs.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify({ outputPath, shape, maxGapDays: maxGap, pairs: pairs.length, invalid, details }, null, 2),
);

const line = (p) => `${String(p.index).padStart(6)}  ${p.first}  ${p.second}  gap ${p.gapDays}d  ${p.problems.length ? `FAIL ${p.problems.join("; ")}` : "ok"}`;
if (pairs.length <= 20) {
  for (const p of pairs) console.log(line(p));
} else {
  for (const p of invalidPairs.slice(0, 20)) console.log(line(p));
  if (invalid > 20) console.log(`  ... ${invalid - 20} more invalid pairs in ${reportPath}`);
}
console.log(`shape: ${shape}, pairs: ${pairs.length}, invalid: ${invalid}, report: ${reportPath}`);
process.exit(invalid ? 1 : 0);
