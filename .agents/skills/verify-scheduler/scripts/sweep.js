#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * sweep.js - drive every roster scenario and the README patient under SEED_CLINICIANS=roster, compare each
 * result with its literal expectation, and run the three oracles on each drive's evidence.
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/sweep.js --run <run-id> [--seed small|full|midnight]
 *        [--appointments none|busy] [--out <evidence-root>]
 *
 * Reads ROSTER_SCENARIOS and rosterKeyOf from src/starter-code/mock-roster.ts. For each scenario, and for a
 * "byrne" row with the README patient, spawns drive.js --feature roster --clinicians roster with the patient's
 * --state, --insurance, --first, --last, --patient-id, and --label <key>[-<seed>][-<appointments>], so
 * drive.js writes every evidence directory. A scenario passes "exact" when output.json, mapped to
 * [rosterKey, [first, second][]] groups, equals its expected groups; the byrne row passes when every group is
 * Dr. Doe's. Then pairs.js, optimized.js, and capacity.js run on each evidence directory.
 *
 * Evidence: <evidence-root>/<run>/roster/<label>/ per drive, and <evidence-root>/<run>/roster/sweep.json.
 *
 * Exit codes: 0 every expectation and oracle passed; 1 an expectation or oracle failed;
 *             2 a drive could not run or the harness could not start.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { findRepoRoot, parseArgs, evidenceRoot, registerTsNode } = require("./common");

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
if (!args.run) {
  console.error("--run <run-id> is required");
  process.exit(2);
}

const root = findRepoRoot(__dirname);
registerTsNode(root, { transpileOnly: true });
const { ROSTER_SCENARIOS, rosterKeyOf } = require(path.join(root, "src", "starter-code", "mock-roster"));
const { patient: readmePatient } = require(path.join(root, "src", "starter-code", "mock-patient"));
const { SEED_CLINICIAN_ID } = require(path.join(root, "src", "mockSlotOrm"));

const suffix = `${args.seed && args.seed !== "small" ? `-${args.seed}` : ""}${args.appointments && args.appointments !== "none" ? `-${args.appointments}` : ""}`;
const passThrough = ["seed", "appointments", "out"].flatMap((flag) => (args[flag] ? [`--${flag}`, args[flag]] : []));
const node = (script, scriptArgs) => spawnSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], { cwd: root, encoding: "utf8" });
const rows = [...ROSTER_SCENARIOS.map((s) => ({ key: s.key, patient: s.patient, expected: s.expected })), { key: "byrne", patient: readmePatient }];

const results = [];
for (const { key, patient, expected } of rows) {
  const label = `${key}${suffix}`;
  const drive = node("drive.js", [
    "--feature", "roster", "--run", args.run, "--clinicians", "roster",
    "--state", patient.state, "--insurance", patient.insurance, "--first", patient.firstName, "--last", patient.lastName,
    "--patient-id", patient.id, "--label", label, ...passThrough,
  ]);
  const evidenceDir = /^OK evidence: (.+)$/m.exec(drive.stdout || "");
  if (drive.status !== 0 || !evidenceDir) {
    results.push({ key, patient: `${patient.state}/${patient.insurance}`, drive: drive.status, error: (drive.stderr || "").trim() });
    continue;
  }
  const dir = evidenceDir[1].trim();
  const output = JSON.parse(fs.readFileSync(path.join(dir, "output.json"), "utf8"));
  const actual = output.map((g) => [rosterKeyOf(g.clinician.id), g.options.map((o) => [o.first.date, o.second.date])]);
  const options = output.reduce((n, g) => n + g.options.length, 0);
  const check = expected
    ? { name: "exact", pass: JSON.stringify(actual) === JSON.stringify(expected) }
    : { name: "doe-only", pass: output.every((g) => g.clinician.id === SEED_CLINICIAN_ID) };
  const oracles = Object.fromEntries(["pairs", "optimized", "capacity"].map((oracle) => [oracle, node(`${oracle}.js`, [dir]).status]));
  results.push({ key, patient: `${patient.state}/${patient.insurance}`, drive: 0, evidenceDir: dir, check: check.name, pass: check.pass, options, oracles, ...(check.pass ? {} : { actual, expected }) });
}

const reportDir = path.join(evidenceRoot(root, args), args.run, "roster");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `sweep${suffix}.json`);
fs.writeFileSync(reportPath, JSON.stringify({ run: args.run, seed: args.seed || "small", appointments: args.appointments || "none", results }, null, 2));

for (const r of results) {
  if (r.drive !== 0) {
    console.log(`${r.key} ${r.patient} DRIVE FAILED (exit ${r.drive}) ${r.error}`);
    continue;
  }
  const oracles = Object.entries(r.oracles).map(([name, status]) => `${name} ${status === 0 ? "ok" : `FAIL (exit ${status})`}`).join(" ");
  console.log(`${r.key} ${r.patient} ${r.check} ${r.pass ? "ok" : "FAIL"} (${r.options} options) ${oracles}`);
}
const driveFailed = results.some((r) => r.drive !== 0);
const failed = results.some((r) => r.drive === 0 && (!r.pass || Object.values(r.oracles).some((status) => status !== 0)));
console.log(`rows: ${results.length}, report: ${reportPath}`);
process.exit(driveFailed ? 2 : failed ? 1 : 0);
