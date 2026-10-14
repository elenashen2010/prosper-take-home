#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness */
/*
 * pairs.js - check the README pairing rule against a drive's output.json.
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/pairs.js <evidence-dir-or-output.json> [--max-gap-days 7]
 *
 * Reads the scheduler's output as groups `{ clinician: { id, timezone }, options: [{ first, second }] }[]`.
 * Each pair must be one clinician (the group's clinician), on different days of the clinician's calendar
 * (`clinician.timezone`), `second` later than `first`, at most --max-gap-days apart (default 7). Writes
 * pairs.json next to output.json: every pair when there are at most 200, otherwise only the invalid ones
 * (first 1000) plus totals. Prints the first 20 invalid pairs and the totals. Exit 0 when every pair is
 * valid; 1 when any pair violates; 2 when the output is not groups or a group has no clinician.timezone.
 */
const fs = require("fs");
const path = require("path");
const { localDayByOffset } = require("./common");

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

if (!Array.isArray(output) || !output.every(isGroup)) {
  const got = Array.isArray(output) ? `array of ${output.length}` : typeof output;
  console.error(`NOT PAIRABLE: expected clinician groups with { first, second } options, got ${got}`);
  process.exit(2);
}
for (const g of output) {
  if (typeof g.clinician.timezone !== "string") {
    console.error(`NOT PAIRABLE: group ${g.clinician.id} has no clinician.timezone`);
    process.exit(2);
  }
  try {
    localDayByOffset("2024-01-01T00:00:00.000Z", g.clinician.timezone);
  } catch {
    console.error(`NOT PAIRABLE: group ${g.clinician.id} has unknown time zone ${g.clinician.timezone}`);
    process.exit(2);
  }
}

const utcMidnight = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const pairs = output
  .flatMap((g) => g.options.map((o) => [o.first, o.second, g.clinician]))
  .map(([a, b, { id: groupClinicianId, timezone }], index) => {
    const firstDay = localDayByOffset(a.date, timezone);
    const secondDay = localDayByOffset(b.date, timezone);
    const gapDays = (utcMidnight(secondDay) - utcMidnight(firstDay)) / 86400000;
    const problems = [];
    if (a.clinicianId !== b.clinicianId) problems.push("different clinicians");
    if (a.clinicianId !== groupClinicianId || b.clinicianId !== groupClinicianId) {
      problems.push(`slot clinician differs from group clinician ${groupClinicianId}`);
    }
    if (gapDays === 0) problems.push(`same local day ${firstDay} (${timezone})`);
    if (gapDays < 0) problems.push("second starts on an earlier local day than first");
    if (gapDays > maxGap) problems.push(`${gapDays} local days apart (max ${maxGap})`);
    return { index, first: a.date, second: b.date, clinicianId: a.clinicianId, timezone, firstDay, secondDay, gapDays, problems };
  });

const invalidPairs = pairs.filter((p) => p.problems.length);
const invalid = invalidPairs.length;
const details = pairs.length <= 200 ? pairs : invalidPairs.slice(0, 1000);
const reportPath = path.join(path.dirname(outputPath), "pairs.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify({ outputPath, shape: "groups", maxGapDays: maxGap, pairs: pairs.length, invalid, details }, null, 2),
);

const line = (p) =>
  `${String(p.index).padStart(6)}  ${p.first}  ${p.second}  ${p.firstDay} -> ${p.secondDay} gap ${p.gapDays}d  ${p.problems.length ? `FAIL ${p.problems.join("; ")}` : "ok"}`;
if (pairs.length <= 20) {
  for (const p of pairs) console.log(line(p));
} else {
  for (const p of invalidPairs.slice(0, 20)) console.log(line(p));
  if (invalid > 20) console.log(`  ... ${invalid - 20} more invalid pairs in ${reportPath}`);
}
console.log(`shape: groups, pairs: ${pairs.length}, invalid: ${invalid}, report: ${reportPath}`);
process.exit(invalid ? 1 : 0);
