"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness; loads TypeScript via ts-node.register */
// Shared helpers for the verify-scheduler harness. Not a CLI.
const fs = require("fs");
const path = require("path");

const PACKAGE_NAME = "prosper-health-take-home-starter";

function findRepoRoot(start) {
  let dir = fs.realpathSync(start);
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, "utf8")).name === PACKAGE_NAME) return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find package.json named ${PACKAGE_NAME} above ${start}`);
}

function parseArgs(argv, flags = []) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    if (flags.includes(key)) {
      args[key] = true;
      continue;
    }
    const val = argv[i + 1];
    if (val === undefined || val.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = val;
    i++;
  }
  return args;
}

function defaultRunId(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function evidenceRoot(root, args) {
  return path.resolve(root, args.out || ".verify-evidence");
}

// Load TypeScript sources from src/ in-process, exactly as `npm run dev` (ts-node) does.
function registerTsNode(root, { transpileOnly = false } = {}) {
  const tsNode = require(path.join(root, "node_modules", "ts-node"));
  tsNode.register({ project: path.join(root, "tsconfig.json"), transpileOnly });
}

// Convert Dates/Maps/Sets to JSON-friendly values. Shared references are fine; only true cycles are cut.
function toPlain(value, ancestors = []) {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([k, v]) => [String(k), toPlain(v, ancestors)]));
  }
  if (value instanceof Set) return [...value].map((v) => toPlain(v, ancestors));
  if (Array.isArray(value)) {
    if (ancestors.includes(value)) return "[Circular]";
    return value.map((v) => toPlain(v, [...ancestors, value]));
  }
  if (value && typeof value === "object") {
    if (ancestors.includes(value)) return "[Circular]";
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v, [...ancestors, value]);
    return out;
  }
  return value;
}

module.exports = { findRepoRoot, parseArgs, defaultRunId, evidenceRoot, registerTsNode, toPlain };
