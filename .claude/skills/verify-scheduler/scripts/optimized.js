#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * optimized.js - check README Task 2 over a drive's evidence: for every clinician and UTC day that the
 * scheduler offered, the offered starts must be exactly the starts that keep the day's maximum number of
 * bookable sessions ("a start is kept iff it lies in some maximum set of non-overlapping sessions").
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/optimized.js <evidence-dir>
 *
 * Reads output.json (clinician groups with { first, second } options) and summary.json (for the seed),
 * loads the unfiltered slots for each clinician through the real slot repository with that seed, and
 * re-derives the keep set here with an independent implementation. Days the scheduler did not offer at all
 * are reported as "unoffered" (pairing may have excluded them) and do not fail the check.
 * Writes optimized.json next to output.json. Exit 0 when no offered day has an extra or missing start,
 * 1 when any does, 2 when the evidence is not the grouped shape.
 */
const fs = require("fs");
const path = require("path");
const { findRepoRoot, registerTsNode } = require("./common");

const dir = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(dir, "output.json")) || !fs.existsSync(path.join(dir, "summary.json"))) {
  console.error("usage: optimized.js <evidence-dir containing output.json and summary.json>");
  process.exit(2);
}
const output = JSON.parse(fs.readFileSync(path.join(dir, "output.json"), "utf8"));
const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));

const isSlot = (s) => s && typeof s.date === "string" && typeof s.clinicianId === "string";
const isGroup = (g) => g && g.clinician && typeof g.clinician.id === "string" && Array.isArray(g.options) && g.options.every((o) => o && isSlot(o.first) && isSlot(o.second));
if (!Array.isArray(output) || !output.every(isGroup)) {
  console.error("NOT CHECKABLE: output.json is not an array of clinician groups with { first, second } options");
  process.exit(2);
}

process.env.SEED_SLOTS = summary.seed || "small";
const root = findRepoRoot(__dirname);
registerTsNode(root, { transpileOnly: true });
const { slotRepository } = require(path.join(root, "src", "mockSlotOrm"));

const dayOf = (iso) => iso.slice(0, 10);

// Independent reference rule over [start, end) intervals: keep interval i iff
// longestChainBefore(i) + 1 + longestChainAfter(i) equals the day's maximum chain length.
function keptStarts(intervals) {
  const n = intervals.length;
  const longest = (i, dir) => {
    const memo = new Map();
    const f = (k) => {
      if (memo.has(k)) return memo.get(k);
      let best = 0;
      for (let m = 0; m < n; m++) {
        const fitsBefore = dir < 0 && intervals[m].end <= intervals[k].start;
        const fitsAfter = dir > 0 && intervals[m].start >= intervals[k].end;
        if (fitsBefore || fitsAfter) best = Math.max(best, f(m) + 1);
      }
      memo.set(k, best);
      return best;
    };
    return f(i);
  };
  const through = intervals.map((_, i) => longest(i, -1) + 1 + longest(i, 1));
  const max = Math.max(0, ...through);
  return new Set(intervals.filter((_, i) => through[i] === max).map((iv) => iv.iso));
}

const report = [];
let failures = 0;
for (const group of output) {
  const clinicianId = group.clinician.id;
  const offeredByDay = new Map();
  for (const { first, second } of group.options) {
    for (const slot of [first, second]) {
      if (slot.clinicianId !== clinicianId) continue;
      const day = dayOf(slot.date);
      if (!offeredByDay.has(day)) offeredByDay.set(day, new Set());
      offeredByDay.get(day).add(slot.date);
    }
  }
  const allByDay = new Map();
  for (const slot of slotRepository.findByClinician(clinicianId)) {
    const iso = slot.date.toISOString();
    const day = dayOf(iso);
    if (!allByDay.has(day)) allByDay.set(day, []);
    allByDay.get(day).push({ iso, start: slot.date.getTime(), end: slot.date.getTime() + slot.length * 60000 });
  }
  for (const [day, intervals] of [...allByDay].sort()) {
    const expected = keptStarts(intervals);
    const offered = offeredByDay.get(day);
    const entry = { clinicianId, day, slots: intervals.length, expectedKept: expected.size };
    if (!offered) {
      entry.status = "unoffered";
    } else {
      entry.extra = [...offered].filter((d) => !expected.has(d)).sort();
      entry.missing = [...expected].filter((d) => !offered.has(d)).sort();
      entry.status = entry.extra.length || entry.missing.length ? "FAIL" : "ok";
      if (entry.status === "FAIL") failures++;
    }
    report.push(entry);
  }
}

fs.writeFileSync(path.join(dir, "optimized.json"), JSON.stringify({ seed: process.env.SEED_SLOTS, failures, days: report }, null, 2));
for (const e of report) {
  if (e.status === "ok") continue;
  const detail = e.status === "FAIL" ? ` extra ${JSON.stringify(e.extra)} missing ${JSON.stringify(e.missing)}` : "";
  console.log(`${e.status.padEnd(9)} ${e.clinicianId.slice(0, 8)} ${e.day} slots ${e.slots} keep ${e.expectedKept}${detail}`);
}
const offeredDays = report.filter((e) => e.status !== "unoffered").length;
console.log(`seed: ${process.env.SEED_SLOTS}, days offered: ${offeredDays}, ok: ${offeredDays - failures}, failing: ${failures}, unoffered: ${report.length - offeredDays}, report: ${path.join(dir, "optimized.json")}`);
process.exit(failures ? 1 : 0);
