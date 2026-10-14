#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * capacity.js - check README Task 3 over a drive's evidence: no offered session overlaps a held appointment or
 * overruns the clinician's daily or weekly maximum, every pair the offered slots allow is offered, and every
 * day that could pair is offered.
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/capacity.js <evidence-dir>
 *
 * Reads output.json (clinician groups with { first, second } options) and summary.json (seed, appointment set,
 * patient). Loads the eligible psychologists, their slots, and their appointment rows through the real
 * repositories with those seeds, and builds the held model with the harness's own tables and day arithmetic
 * (common.js), never the app's. Held statuses are UPCOMING, OCCURRED, NO_SHOW; sessions are 90 minutes; weeks
 * start on Monday. Checks per group:
 *   soundness   each option: no session overlaps a held interval (rule "overlap"); each session's day has
 *               held + sessions on that day <= maxDailyAppointments ("daily"); each distinct week among the
 *               two sessions has held + sessions in that week <= maxWeeklyAppointments ("weekly", or
 *               "weekly-pair" when both sessions fall in that week).
 *   closure     with S[d] the offered slots of local day d, the options are exactly the pairs (a in S[d1],
 *               b in S[d2]) with d2 1 to 7 days after d1 that pass soundness.
 *   completeness a raw-slot day with a slot clear of held intervals and room >= 1 is offered iff another such
 *               day 1 to 7 days away passes the daily and weekly checks with it.
 * Writes capacity.json next to output.json and prints a totals line. Under an appointment set with no held
 * rows it prints "vacuous: 0 held" and exits 0.
 * Exit 0 when nothing is violated; 1 when any rule, closure, or completeness check fails; 2 when the evidence
 * is not checkable (not groups, no clinician.timezone, a zone that differs from the repository's, no
 * summary.appointments, an appointment with an unknown status or type).
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

const MAX_GAP_DAYS = 7;
const REPORT_LIMIT = 1000;

function notCheckable(message) {
  console.error(`NOT CHECKABLE: ${message}`);
  process.exit(2);
}

const dir = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(path.join(dir, "output.json")) || !fs.existsSync(path.join(dir, "summary.json"))) {
  console.error("usage: capacity.js <evidence-dir containing output.json and summary.json>");
  process.exit(2);
}
const output = JSON.parse(fs.readFileSync(path.join(dir, "output.json"), "utf8"));
const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));

const isSlot = (s) => s && typeof s.date === "string" && typeof s.clinicianId === "string";
const isGroup = (g) =>
  g && g.clinician && typeof g.clinician.id === "string" && Array.isArray(g.options) && g.options.every((o) => o && isSlot(o.first) && isSlot(o.second));
if (!Array.isArray(output) || !output.every(isGroup)) notCheckable("output.json is not an array of clinician groups with { first, second } options");
for (const g of output) {
  if (typeof g.clinician.timezone !== "string") notCheckable(`group ${g.clinician.id} has no clinician.timezone`);
}
if (typeof summary.appointments !== "string") notCheckable("summary.json has no appointments set; re-drive with this drive.js");
if (!summary.patient || !summary.patient.state || !summary.patient.insurance) notCheckable("summary.json has no patient with state and insurance");

const { seed, appointments } = applySeedEnv({ seed: summary.seed, appointments: summary.appointments, clinicians: summary.clinicians });
const root = findRepoRoot(__dirname);
registerTsNode(root, { transpileOnly: true });
const { slotRepository } = require(path.join(root, "src", "mockSlotOrm"));
const { clinicianRepository } = require(path.join(root, "src", "mockClinicianOrm"));
const { appointmentRepository } = require(path.join(root, "src", "mockAppointmentOrm"));

const SESSION_MS = HARNESS_SESSION_MINUTES.ASSESSMENT_SESSION_1 * 60000;
const daysApart = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;

const psychologists = clinicianRepository.findByTypeStateAndInsurance({
  clinicianType: "PSYCHOLOGIST",
  state: summary.patient.state,
  insurance: summary.patient.insurance,
});

const groups = [];
for (const clinician of psychologists) {
  const zone = clinician.timezone;
  let model;
  try {
    model = heldModel(appointmentRepository.findByClinician(clinician.id), zone);
  } catch (e) {
    if (e instanceof NotCheckable) notCheckable(e.message);
    throw e;
  }
  const group = output.find((g) => g.clinician.id === clinician.id);
  if (group && group.clinician.timezone !== zone) notCheckable(`group ${clinician.id} has zone ${group.clinician.timezone}, the repository has ${zone}`);
  groups.push({ clinician, zone, model, options: group ? group.options : [] });
}
for (const g of output) {
  if (!psychologists.some((c) => c.id === g.clinician.id)) notCheckable(`group ${g.clinician.id} is not an eligible psychologist in the clinician repository`);
}

const totalHeld = groups.reduce((n, g) => n + g.model.held.length, 0);
const reportPath = path.join(dir, "capacity.json");
if (totalHeld === 0) {
  fs.writeFileSync(reportPath, JSON.stringify({ seed, appointments, vacuous: true, held: 0 }, null, 2));
  console.log(`seed: ${seed}, appointments: ${appointments}, vacuous: 0 held, report: ${reportPath}`);
  process.exit(0);
}

const report = [];
let problems = 0;
for (const { clinician, zone, model, options } of groups) {
  const maxDaily = clinician.maxDailyAppointments;
  const maxWeekly = clinician.maxWeeklyAppointments;
  const days = new Map();
  const dayOf = (iso) => {
    if (!days.has(iso)) days.set(iso, localDayByOffset(iso, zone));
    return days.get(iso);
  };
  const heldOn = (day) => model.heldDay[day] || 0;
  const heldIn = (week) => model.heldWeek[week] || 0;
  const overlapping = (iso) => {
    const start = Date.parse(iso);
    return model.held.find((h) => start < h.end && h.start < start + SESSION_MS);
  };

  const violationsOf = (sessions) => {
    const found = [];
    const perDay = {};
    const perWeek = {};
    for (const iso of sessions) {
      const hit = overlapping(iso);
      if (hit) found.push({ rule: "overlap", session: iso, appointment: hit.id, held: [hit.scheduledFor, new Date(hit.end).toISOString()] });
      const day = dayOf(iso);
      perDay[day] = (perDay[day] || 0) + 1;
      const week = weekByOffset(day);
      perWeek[week] = (perWeek[week] || 0) + 1;
    }
    for (const [day, n] of Object.entries(perDay)) {
      if (heldOn(day) + n > maxDaily) found.push({ rule: "daily", day, held: heldOn(day), requested: n, max: maxDaily });
    }
    for (const [week, n] of Object.entries(perWeek)) {
      if (heldIn(week) + n > maxWeekly) found.push({ rule: n > 1 ? "weekly-pair" : "weekly", week, held: heldIn(week), requested: n, max: maxWeekly });
    }
    return found;
  };
  const dayPairFits = (d1, d2) => {
    const w1 = weekByOffset(d1);
    const w2 = weekByOffset(d2);
    if (heldOn(d1) + 1 > maxDaily || heldOn(d2) + 1 > maxDaily) return false;
    if (w1 === w2) return heldIn(w1) + 2 <= maxWeekly;
    return heldIn(w1) + 1 <= maxWeekly && heldIn(w2) + 1 <= maxWeekly;
  };

  const violations = [];
  const offeredByDay = new Map();
  const offeredKeys = new Set();
  for (const { first, second } of options) {
    for (const v of violationsOf([first.date, second.date])) violations.push({ first: first.date, second: second.date, ...v });
    offeredKeys.add(`${first.date}|${second.date}`);
    for (const iso of [first.date, second.date]) {
      const day = dayOf(iso);
      if (!offeredByDay.has(day)) offeredByDay.set(day, new Set());
      offeredByDay.get(day).add(iso);
    }
  }

  const offeredDays = [...offeredByDay.keys()].sort();
  const expectedKeys = new Set();
  for (const d1 of offeredDays) {
    for (const d2 of offeredDays) {
      const gap = daysApart(d1, d2);
      if (gap < 1 || gap > MAX_GAP_DAYS) continue;
      for (const a of offeredByDay.get(d1)) {
        for (const b of offeredByDay.get(d2)) {
          if (violationsOf([a, b]).length === 0) expectedKeys.add(`${a}|${b}`);
        }
      }
    }
  }
  const pairOf = (key) => {
    const [first, second] = key.split("|");
    return { first, second };
  };
  const closureExtras = [...offeredKeys].filter((k) => !expectedKeys.has(k)).sort().map(pairOf);
  const closureMisses = [...expectedKeys].filter((k) => !offeredKeys.has(k)).sort().map(pairOf);

  const slotDays = new Map();
  for (const slot of slotRepository.findByClinician(clinician.id)) {
    const iso = slot.date.toISOString();
    const day = dayOf(iso);
    if (!slotDays.has(day)) slotDays.set(day, []);
    slotDays.get(day).push(iso);
  }
  const roomOn = (day) => Math.min(maxDaily - heldOn(day), maxWeekly - heldIn(weekByOffset(day)));
  const openDays = [...slotDays].filter(([day, isos]) => roomOn(day) >= 1 && isos.some((iso) => !overlapping(iso))).map(([day]) => day).sort();
  const completenessMisses = [];
  for (const day of [...slotDays.keys()].sort()) {
    const partner = openDays.includes(day)
      ? openDays.find((other) => {
          const gap = daysApart(day, other);
          return gap !== 0 && Math.abs(gap) <= MAX_GAP_DAYS && (gap > 0 ? dayPairFits(day, other) : dayPairFits(other, day));
        })
      : undefined;
    const shouldOffer = partner !== undefined;
    const offered = offeredByDay.has(day);
    if (shouldOffer && !offered) completenessMisses.push({ day, problem: `not offered, but pairs with ${partner}` });
    if (!shouldOffer && offered) completenessMisses.push({ day, problem: "offered, but has no free slot with room or no day it can pair with" });
  }
  for (const day of offeredDays) {
    if (!slotDays.has(day)) completenessMisses.push({ day, problem: "offered, but the slot repository has no slot that day" });
  }

  const byRule = {};
  for (const v of violations) (byRule[v.rule] = byRule[v.rule] || []).push(v);
  problems += violations.length + closureExtras.length + closureMisses.length + completenessMisses.length;
  report.push({
    clinicianId: clinician.id,
    timezone: zone,
    maxDailyAppointments: maxDaily,
    maxWeeklyAppointments: maxWeekly,
    held: model.held.map(({ id, scheduledFor, appointmentType, status, day, week }) => ({ id, scheduledFor, appointmentType, status, day, week })),
    freed: model.freed,
    heldDay: model.heldDay,
    heldWeek: model.heldWeek,
    options: options.length,
    offeredDays,
    violationCounts: Object.fromEntries(Object.entries(byRule).map(([rule, list]) => [rule, list.length])),
    violations: Object.fromEntries(Object.entries(byRule).map(([rule, list]) => [rule, list.slice(0, REPORT_LIMIT)])),
    closureExtras: closureExtras.length,
    closureMisses: closureMisses.length,
    closureExtrasDetail: closureExtras.slice(0, REPORT_LIMIT),
    closureMissesDetail: closureMisses.slice(0, REPORT_LIMIT),
    completenessMisses,
  });
}

fs.writeFileSync(reportPath, JSON.stringify({ seed, appointments, problems, clinicians: report }, null, 2));
for (const r of report) {
  const id = r.clinicianId.slice(0, 8);
  for (const [rule, list] of Object.entries(r.violations)) {
    for (const v of list.slice(0, 5)) console.log(`FAIL ${id} ${rule}: ${JSON.stringify(v)}`);
  }
  for (const p of r.closureExtrasDetail.slice(0, 5)) console.log(`FAIL ${id} closure extra: ${p.first} + ${p.second}`);
  for (const p of r.closureMissesDetail.slice(0, 5)) console.log(`FAIL ${id} closure miss: ${p.first} + ${p.second}`);
  for (const m of r.completenessMisses.slice(0, 5)) console.log(`FAIL ${id} completeness ${m.day}: ${m.problem}`);
  const rules = Object.entries(r.violationCounts).map(([rule, n]) => `${rule} ${n}`).join(", ") || "none";
  console.log(
    `${id} (${r.timezone}) options: ${r.options}, held: ${r.held.length}, freed: ${r.freed.length}, offered days: ${r.offeredDays.length}, violations: ${rules}, closure extras: ${r.closureExtras}, closure misses: ${r.closureMisses}, completeness misses: ${r.completenessMisses.length}`,
  );
}
console.log(`seed: ${seed}, appointments: ${appointments}, held: ${totalHeld}, problems: ${problems}, report: ${reportPath}`);
process.exit(problems ? 1 : 0);
