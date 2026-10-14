#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * optimized.js - check README Task 2, capped by README Task 3, over a drive's evidence: for every clinician and
 * local day that the scheduler offered, the offered starts must be exactly the free starts (no overlap with a
 * held appointment) that keep the day's target reachable, where target = min(longest chain of non-overlapping
 * 90-minute sessions, room) and room = min(maxDaily - held that day, maxWeekly - held that week).
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/optimized.js <evidence-dir>
 *
 * Reads output.json (clinician groups with { first, second } options) and summary.json (for the seed, the
 * appointment set, and the patient), loads each group's clinician through the real clinician repository to
 * learn their time zone and caps, their unfiltered slots and appointment rows through the real slot and
 * appointment repositories with those seeds, buckets everything by the local day in the repository's zone,
 * and re-derives the keep set here with an independent implementation. A group whose clinician.timezone
 * differs from the repository's fails, and so does a slot whose length is not the 90 minutes the scheduler
 * packs with. An offered day whose expected set is empty fails as "no room". Days the scheduler did not offer
 * at all are reported as "unoffered" (pairing or capacity may have excluded them) and do not fail the check.
 * Writes optimized.json next to output.json with each day's held count, room, and target. Exit 0 when no
 * group fails and no offered day has an extra or missing start, 1 when any does, 2 when the evidence is not
 * the grouped shape, a group has no timezone, or an appointment has an unknown status or type.
 */
const fs = require("fs");
const path = require("path");
const {
  findRepoRoot,
  registerTsNode,
  localDayByOffset,
  applySeedEnv,
  weekByOffset,
  HARNESS_SESSION_MINUTES,
  NotCheckable,
  heldModel,
} = require("./common");

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

const { seed, appointments } = applySeedEnv({ seed: summary.seed, appointments: summary.appointments });
const root = findRepoRoot(__dirname);
registerTsNode(root, { transpileOnly: true });
const { slotRepository } = require(path.join(root, "src", "mockSlotOrm"));
const { clinicianRepository } = require(path.join(root, "src", "mockClinicianOrm"));
const { appointmentRepository } = require(path.join(root, "src", "mockAppointmentOrm"));

const SESSION_MS = HARNESS_SESSION_MINUTES.ASSESSMENT_SESSION_1 * 60000;
const clinicianById = new Map(
  clinicianRepository
    .findByTypeStateAndInsurance({ clinicianType: "PSYCHOLOGIST", state: summary.patient.state, insurance: summary.patient.insurance })
    .map((c) => [c.id, c]),
);

function keptStarts(intervals, room) {
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
  const longestChainBefore = (i) => longest(i, -1);
  const longestChainAfter = (i) => longest(i, 1);
  const longestChainThrough = intervals.map((_, i) => longestChainBefore(i) + 1 + longestChainAfter(i));
  const target = Math.min(Math.max(0, ...longestChainThrough), room);
  const kept = target <= 0 ? [] : intervals.filter((_, i) => longestChainThrough[i] >= target);
  return { target, kept: new Set(kept.map((iv) => iv.iso)) };
}

const report = [];
let failures = 0;
for (const group of output) {
  const clinicianId = group.clinician.id;
  const clinician = clinicianById.get(clinicianId);
  const timezone = clinician && clinician.timezone;
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
  let model;
  try {
    model = heldModel(appointmentRepository.findByClinician(clinicianId), timezone);
  } catch (e) {
    if (!(e instanceof NotCheckable)) throw e;
    console.error(`NOT CHECKABLE: ${e.message}`);
    process.exit(2);
  }
  const allByDay = new Map();
  for (const slot of slotRepository.findByClinician(clinicianId)) {
    const iso = slot.date.toISOString();
    if (slot.length !== HARNESS_SESSION_MINUTES.ASSESSMENT_SESSION_1) {
      report.push({ clinicianId, timezone, status: "FAIL", problem: `slot ${iso} is ${slot.length} minutes; the scheduler packs ${HARNESS_SESSION_MINUTES.ASSESSMENT_SESSION_1}` });
      failures++;
    }
    const day = localDayByOffset(iso, timezone);
    if (!allByDay.has(day)) allByDay.set(day, []);
    allByDay.get(day).push({ iso, start: slot.date.getTime(), end: slot.date.getTime() + SESSION_MS });
  }
  for (const [day, intervals] of [...allByDay].sort()) {
    const free = intervals.filter((iv) => !model.held.some((h) => iv.start < h.end && h.start < iv.end));
    const held = model.heldDay[day] || 0;
    const heldInWeek = model.heldWeek[weekByOffset(day)] || 0;
    const room = Math.min(clinician.maxDailyAppointments - held, clinician.maxWeeklyAppointments - heldInWeek);
    const { target, kept: expected } = keptStarts(free, room);
    const offered = offeredByDay.get(day);
    const entry = { clinicianId, timezone, day, slots: intervals.length, free: free.length, held, heldInWeek, room, target, expectedKept: expected.size };
    if (!offered) {
      entry.status = "unoffered";
    } else {
      entry.extra = [...offered].filter((d) => !expected.has(d)).sort();
      entry.missing = [...expected].filter((d) => !offered.has(d)).sort();
      if (expected.size === 0) entry.reason = "no room";
      entry.status = entry.extra.length || entry.missing.length ? "FAIL" : "ok";
      if (entry.status === "FAIL") failures++;
    }
    report.push(entry);
  }
}

fs.writeFileSync(path.join(dir, "optimized.json"), JSON.stringify({ seed, appointments, failures, days: report }, null, 2));
for (const e of report) {
  if (e.status === "ok") continue;
  if (e.problem) {
    console.log(`FAIL      ${e.clinicianId.slice(0, 8)} ${e.timezone} ${e.problem}`);
    continue;
  }
  const detail = e.status === "FAIL" ? ` ${e.reason ? `${e.reason} ` : ""}extra ${JSON.stringify(e.extra)} missing ${JSON.stringify(e.missing)}` : "";
  console.log(
    `${e.status.padEnd(9)} ${e.clinicianId.slice(0, 8)} ${e.day} (${e.timezone}) slots ${e.slots} free ${e.free} held ${e.held} room ${e.room} target ${e.target} keep ${e.expectedKept}${detail}`,
  );
}
const dayEntries = report.filter((e) => e.day);
const offeredDays = dayEntries.filter((e) => e.status !== "unoffered").length;
const failingDays = dayEntries.filter((e) => e.status === "FAIL").length;
console.log(`seed: ${seed}, appointments: ${appointments}, days offered: ${offeredDays}, ok: ${offeredDays - failingDays}, failing: ${failures}, unoffered: ${dayEntries.length - offeredDays}, report: ${path.join(dir, "optimized.json")}`);
process.exit(failures ? 1 : 0);
