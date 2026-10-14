#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
/*
 * cleanup.js - tear down what a verification run created, and confirm its evidence survived.
 *
 * Usage:
 *   node .agents/skills/verify-scheduler/scripts/cleanup.js --run <run-id> [--out <evidence-root>] [--remove-dist]
 *
 * The harness starts no server and no background process: every drive is a node process that exits
 * on its own, so there is nothing to kill. --remove-dist deletes <repo>/dist only when you ran
 * `npm run compile` for this run; drive.js never creates it.
 * Exit 0 when the run's evidence is present; exit 1 when it is missing (a cleanup must never eat the proof).
 */
const fs = require("fs");
const path = require("path");
const { findRepoRoot, parseArgs, evidenceRoot } = require("./common");

const args = parseArgs(process.argv.slice(2), ["remove-dist"]);
if (!args.run) {
  console.error("--run <run-id> is required");
  process.exit(2);
}
const root = findRepoRoot(__dirname);

console.log("processes: none started by this harness (each drive exits on its own); nothing to kill");

if (args["remove-dist"]) {
  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true, force: true });
    console.log(`removed: ${dist}`);
  } else {
    console.log("dist/: not present");
  }
}

const runDir = path.join(evidenceRoot(root, args), args.run);
if (!fs.existsSync(runDir)) {
  console.error(`EVIDENCE MISSING: ${runDir}`);
  process.exit(1);
}
const files = [];
(function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) walk(p);
    else files.push(path.relative(runDir, p));
  }
})(runDir);
console.log(`evidence kept: ${runDir} (${files.length} files)`);
for (const f of files) console.log(`  ${f}`);
