#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * optimized.js - check README Task 2 over a drive's evidence: for every clinician and local day that the
 * scheduler offered, the offered starts must be exactly the starts that keep the day's maximum number of
 * bookable sessions ("a start is kept iff it lies in some maximum set of non-overlapping sessions").
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/optimized.js <evidence-dir>
 *
 * Reads output.json (clinician groups with { first, second } options) and summary.json (for the seed and
 * the patient), loads each group's clinician through the real clinician repository to learn their time zone
 * and the unfiltered slots through the real slot repository with that seed, buckets both by the local day
 * in the repository's zone, and re-derives the keep set here with an independent implementation. A group
 * whose clinician.timezone differs from the repository's fails. Days the scheduler did not offer at all are
 * reported as "unoffered" (pairing may have excluded them) and do not fail the check.
 * Writes optimized.json next to output.json. Exit 0 when no group fails and no offered day has an extra or
 * missing start, 1 when any does, 2 when the evidence is not the grouped shape or a group has no timezone.
 */
const fs = require("fs");
const path = require("path");
const { findRepoRoot, registerTsNode, localDayByOffset } = require("./common");

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
for (const g of output) {
  if (typeof g.clinician.timezone !== "string") {
    console.error(`NOT CHECKABLE: group ${g.clinician.id} has no clinician.timezone`);
    process.exit(2);
  }
}
if (!summary.patient || !summary.patient.state || !summary.patient.insurance) {
  console.error("NOT CHECKABLE: summary.json has no patient with state and insurance");
  process.exit(2);
}

process.env.SEED_SLOTS = summary.seed || "small";
const root = findRepoRoot(__dirname);
registerTsNode(root, { transpileOnly: true });
const { slotRepository } = require(path.join(root, "src", "mockSlotOrm"));
const { clinicianRepository } = require(path.join(root, "src", "mockClinicianOrm"));

const zoneById = new Map(
  clinicianRepository
    .findByTypeStateAndInsurance({ clinicianType: "PSYCHOLOGIST", state: summary.patient.state, insurance: summary.patient.insurance })
    .map((c) => [c.id, c.timezone]),
);

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
  const timezone = zoneById.get(clinicianId);
  if (timezone === undefined) {
    report.push({ clinicianId, timezone: group.clinician.timezone, status: "FAIL", problem: "not an eligible psychologist in the clinician repository" });
    failures++;
    continue;
  }
  if (group.clinician.timezone !== timezone) {
    report.push({ clinicianId, timezone: group.clinician.timezone, status: "FAIL", problem: `zone mismatch: repository has ${timezone}` });
    failures++;
  }
  const offeredByDay = new Map();
  for (const { first, second } of group.options) {
    for (const slot of [first, second]) {
      if (slot.clinicianId !== clinicianId) continue;
      const day = localDayByOffset(slot.date, timezone);
      if (!offeredByDay.has(day)) offeredByDay.set(day, new Set());
      offeredByDay.get(day).add(slot.date);
    }
  }
  const allByDay = new Map();
  for (const slot of slotRepository.findByClinician(clinicianId)) {
    const iso = slot.date.toISOString();
    const day = localDayByOffset(iso, timezone);
    if (!allByDay.has(day)) allByDay.set(day, []);
    allByDay.get(day).push({ iso, start: slot.date.getTime(), end: slot.date.getTime() + slot.length * 60000 });
  }
  for (const [day, intervals] of [...allByDay].sort()) {
    const expected = keptStarts(intervals);
    const offered = offeredByDay.get(day);
    const entry = { clinicianId, timezone, day, slots: intervals.length, expectedKept: expected.size };
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
  if (e.problem) {
    console.log(`FAIL      ${e.clinicianId.slice(0, 8)} ${e.timezone} ${e.problem}`);
    continue;
  }
  const detail = e.status === "FAIL" ? ` extra ${JSON.stringify(e.extra)} missing ${JSON.stringify(e.missing)}` : "";
  console.log(`${e.status.padEnd(9)} ${e.clinicianId.slice(0, 8)} ${e.day} (${e.timezone}) slots ${e.slots} keep ${e.expectedKept}${detail}`);
}
const dayEntries = report.filter((e) => e.day);
const offeredDays = dayEntries.filter((e) => e.status !== "unoffered").length;
const failingDays = dayEntries.filter((e) => e.status === "FAIL").length;
console.log(`seed: ${process.env.SEED_SLOTS}, days offered: ${offeredDays}, ok: ${offeredDays - failingDays}, failing: ${failures}, unoffered: ${dayEntries.length - offeredDays}, report: ${path.join(dir, "optimized.json")}`);
process.exit(failures ? 1 : 0);
