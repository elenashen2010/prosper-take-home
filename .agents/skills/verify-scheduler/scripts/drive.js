#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * drive.js - run the scheduler the way src/index.ts does, for a chosen patient, and write evidence.
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/drive.js --feature <feature-id> [--run <run-id>]
 *        [--state NY] [--insurance AETNA] [--first Byrne] [--last Hollander] [--patient-id <id>]
 *        [--seed small|full|midnight] [--label <name>] [--expect-min N] [--expect-max N]
 *        [--expect-contains <iso[,iso...]>] [--expect-absent <iso[,iso...]>]
 *        [--print] [--out <evidence-root>]
 *
 * Defaults: the patient is the seed patient from src/starter-code/mock-patient.ts with any overrides
 * applied; run id is a timestamp; evidence root is <repo>/.verify-evidence; --seed is small.
 * --seed sets SEED_SLOTS before the app loads; an unknown seed is reported as the scheduler throwing (exit 2).
 *
 * Evidence: <evidence-root>/<run>/<feature>/<label>/{command.txt,input.json,output.json,summary.json}
 *
 * Exit codes: 0 scheduler ran and every expectation held; 1 an expectation failed;
 *             2 the scheduler threw or the harness could not run.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { findRepoRoot, parseArgs, defaultRunId, evidenceRoot, registerTsNode, toPlain } = require("./common");

let args;
try {
  args = parseArgs(process.argv.slice(2), ["print"]);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
if (!args.feature) {
  console.error("--feature <feature-id> is required (see features/README.md)");
  process.exit(2);
}

const seed = args.seed || "small";
process.env.SEED_SLOTS = seed;

const root = findRepoRoot(__dirname);
registerTsNode(root); // full type-check, same as `npm run dev`

const { UsStateAbbreviations } = require(path.join(root, "src", "starter-code", "us-states"));
const { InsurancePayers } = require(path.join(root, "src", "starter-code", "payer"));
const { patient: seedPatient } = require(path.join(root, "src", "starter-code", "mock-patient"));

const patient = {
  ...seedPatient,
  id: args["patient-id"] || seedPatient.id,
  firstName: args.first || seedPatient.firstName,
  lastName: args.last || seedPatient.lastName,
  state: args.state || seedPatient.state,
  insurance: args.insurance || seedPatient.insurance,
};
if (!UsStateAbbreviations.includes(patient.state)) {
  console.error(`--state ${patient.state} is not a UsStateAbbreviation`);
  process.exit(2);
}
if (!InsurancePayers.includes(patient.insurance)) {
  console.error(`--insurance ${patient.insurance} is not an InsurancePayer (${InsurancePayers.join(", ")})`);
  process.exit(2);
}

const runId = args.run || defaultRunId();
const label = args.label || `${patient.state}-${patient.insurance}${seed === "small" ? "" : `-${seed}`}`;
const featureRoot = path.join(evidenceRoot(root, args), runId, args.feature);
let dir = path.join(featureRoot, label);
for (let n = 2; fs.existsSync(dir); n++) dir = path.join(featureRoot, `${label}-${n}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "command.txt"), `${process.argv.join(" ")}\ncwd: ${process.cwd()}\n`);
fs.writeFileSync(path.join(dir, "input.json"), JSON.stringify(toPlain(patient), null, 2));

const apiPath = path.join(root, "src", "schedulerApi.ts");
const apiSha256 = crypto.createHash("sha256").update(fs.readFileSync(apiPath)).digest("hex");

const started = Date.now();
let result;
let error = null;
try {
  const { findAvailableSlots } = require(path.join(root, "src", "schedulerApi"));
  result = findAvailableSlots(patient);
} catch (e) {
  error = { message: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : null };
}
const durationMs = Date.now() - started;
const plain = error ? null : toPlain(result);

// Shape-agnostic summary: count top-level items, collect every slot date found anywhere, bucket by clinicianId.
const slotDates = [];
const byClinician = {};
(function walk(node, clinicianHint) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, clinicianHint));
  if (!node || typeof node !== "object") return;
  const cid = typeof node.clinicianId === "string" ? node.clinicianId : clinicianHint;
  if (typeof node.date === "string" && !Number.isNaN(Date.parse(node.date))) {
    slotDates.push(node.date);
    const key = cid || "(no clinicianId)";
    byClinician[key] = (byClinician[key] || 0) + 1;
  }
  for (const [k, v] of Object.entries(node)) walk(v, cid || (/^[0-9a-f-]{36}$/i.test(k) ? k : undefined));
})(plain);
slotDates.sort();
const count = Array.isArray(plain)
  ? plain.length
  : plain && typeof plain === "object"
    ? Object.keys(plain).length
    : null;

const expectations = [];
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
if (args["expect-min"] !== undefined) {
  expectations.push({ name: `count >= ${args["expect-min"]}`, pass: count !== null && count >= Number(args["expect-min"]) });
}
if (args["expect-max"] !== undefined) {
  expectations.push({ name: `count <= ${args["expect-max"]}`, pass: count !== null && count <= Number(args["expect-max"]) });
}
for (const iso of list(args["expect-contains"])) expectations.push({ name: `contains slot ${iso}`, pass: slotDates.includes(iso) });
for (const iso of list(args["expect-absent"])) expectations.push({ name: `absent slot ${iso}`, pass: !slotDates.includes(iso) });

const summary = {
  feature: args.feature,
  run: runId,
  label,
  seed,
  checkedAt: new Date().toISOString(),
  node: process.versions.node,
  schedulerApiSha256: apiSha256,
  patient: toPlain(patient),
  durationMs,
  error,
  shape: error ? null : Array.isArray(plain) ? "array" : typeof plain,
  count,
  slotDatesFound: slotDates.length,
  slotDateRange: slotDates.length ? [slotDates[0], slotDates[slotDates.length - 1]] : null,
  byClinician,
  expectations,
  evidenceDir: dir,
};
fs.writeFileSync(path.join(dir, "output.json"), JSON.stringify(error ? { error } : plain, null, 2));
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));

console.log(JSON.stringify({ ...summary, patient: `${patient.state}/${patient.insurance}` }, null, 2));
if (args.print) console.log(JSON.stringify(error ? { error } : plain, null, 2));

if (error) {
  console.error(`SCHEDULER THREW: ${error.message}`);
  process.exit(2);
}
const failed = expectations.filter((e) => !e.pass);
if (failed.length) {
  console.error(`EXPECTATIONS FAILED: ${failed.map((e) => e.name).join("; ")}`);
  process.exit(1);
}
console.log(`OK evidence: ${dir}`);
