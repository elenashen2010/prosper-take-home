#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * doctor.js - read-only check: is this checkout worth driving?
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/doctor.js [--seed small|full|midnight] [--out <file.json>]
 *
 * Checks toolchain, dependencies, a full type-check, the scheduler export, and the seed data.
 * --seed (default small) sets SEED_SLOTS so the seed checks describe the set a drive will use;
 * an unknown seed fails the scheduler export check.
 * Exit 0 when every check is ok or warn; exit 1 when any check fails.
 * The only thing it writes is the optional --out report.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { findRepoRoot, parseArgs, registerTsNode } = require("./common");

const args = parseArgs(process.argv.slice(2));
const seed = args.seed || "small";
process.env.SEED_SLOTS = seed;
const checks = [];
function run(name, fn) {
  try {
    const r = fn();
    const isObj = r && typeof r === "object" && !Array.isArray(r);
    checks.push({
      name,
      status: isObj && r.warn ? "warn" : "ok",
      detail: isObj && r.detail !== undefined ? r.detail : r,
    });
  } catch (e) {
    checks.push({ name, status: "fail", detail: e && e.message ? e.message : String(e) });
  }
}

let root;
run("repo root", () => {
  root = findRepoRoot(__dirname);
  return root;
});
if (!root) {
  report();
  process.exit(1);
}

run("node >= 18", () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) throw new Error(`node ${process.versions.node} is too old`);
  return `node ${process.versions.node}`;
});

run("dependencies installed", () => {
  for (const dep of ["ts-node", "typescript", "jest"]) {
    if (!fs.existsSync(path.join(root, "node_modules", dep))) {
      throw new Error(`node_modules/${dep} missing - run: npm ci`);
    }
  }
  return "ts-node, typescript, jest present";
});

run("type-check (tsc --noEmit)", () => {
  const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
  const r = spawnSync(process.execPath, [tsc, "--noEmit", "-p", path.join(root, "tsconfig.json")], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error((r.stdout || "") + (r.stderr || ""));
  return "clean";
});

run("scheduler API exports findAvailableSlots", () => {
  registerTsNode(root, { transpileOnly: true });
  const api = require(path.join(root, "src", "schedulerApi"));
  if (typeof api.findAvailableSlots !== "function") {
    throw new Error("src/schedulerApi.ts does not export a function named findAvailableSlots");
  }
  return `function with ${api.findAvailableSlots.length} declared parameter(s)`;
});

run("seed patient", () => {
  const { patient } = require(path.join(root, "src", "starter-code", "mock-patient"));
  if (!patient || !patient.state || !patient.insurance) {
    throw new Error("mock-patient.ts has no patient with state and insurance");
  }
  return `${patient.firstName} ${patient.lastName}, ${patient.state}, ${patient.insurance}`;
});

function seedClinician() {
  const { clinician } = require(path.join(root, "src", "starter-code", "mock-clinician"));
  if (!clinician || !Array.isArray(clinician.availableSlots)) {
    throw new Error("mock-clinician.ts has no clinician with availableSlots");
  }
  return clinician;
}

run("seed clinician", () => {
  const clinician = seedClinician();
  const lengths = {};
  for (const s of clinician.availableSlots) lengths[s.length] = (lengths[s.length] || 0) + 1;
  const dates = clinician.availableSlots.map((s) => new Date(s.date).toISOString()).sort();
  return {
    detail: {
      seed,
      id: clinician.id,
      name: `${clinician.firstName} ${clinician.lastName}`,
      type: clinician.clinicianType,
      timezone: clinician.timezone,
      states: clinician.states,
      insurances: clinician.insurances,
      slots: clinician.availableSlots.length,
      slotLengths: lengths,
      slotRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
      appointments: (clinician.appointments || []).length,
      maxDailyAppointments: clinician.maxDailyAppointments,
      maxWeeklyAppointments: clinician.maxWeeklyAppointments,
    },
  };
});

run("seed covers therapy (60-minute slots)", () => {
  const sixty = seedClinician().availableSlots.filter((s) => s.length === 60).length;
  if (sixty === 0) {
    return { warn: true, detail: "no 60-minute slots in seed data - therapy-intake journeys are blocked" };
  }
  return `${sixty} sixty-minute slots`;
});

run("seed covers capacity (existing appointments)", () => {
  const n = (seedClinician().appointments || []).length;
  if (n === 0) {
    return { warn: true, detail: "clinician has 0 appointments - clinician-capacity journeys are blocked" };
  }
  return `${n} appointments`;
});

run("instance ownership", () => "short-lived CLI: no server, no port, no background process to own");

report();
process.exit(checks.some((c) => c.status === "fail") ? 1 : 0);

function report() {
  const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
  console.log("verify-scheduler doctor");
  for (const c of checks) {
    const detail = typeof c.detail === "string" ? c.detail : JSON.stringify(c.detail);
    console.log(`  [${pad(c.status.toUpperCase(), 4)}] ${pad(c.name, 44)} ${detail}`);
  }
  const failed = checks.filter((c) => c.status === "fail").length;
  console.log(failed ? `RESULT: NOT READY (${failed} failing)` : "RESULT: READY");
  if (args.out) {
    const out = path.resolve(args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), root, seed, checks }, null, 2));
    console.log(`report: ${out}`);
  }
}
