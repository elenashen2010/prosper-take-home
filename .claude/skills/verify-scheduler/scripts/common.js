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

function localDayByOffset(iso, zone) {
  const instant = new Date(iso);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName").value;
  const m = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(offset);
  if (!m) throw new Error(`unexpected offset ${offset} for ${zone}`);
  const minutes = m[1] ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(instant.getTime() + minutes * 60000).toISOString().slice(0, 10);
}

// Sets the seed variables the app reads when its seed modules load, so call it before the first require of src/.
function applySeedEnv(args) {
  const seed = args.seed || "small";
  const appointments = args.appointments || "none";
  process.env.SEED_SLOTS = seed;
  process.env.SEED_APPOINTMENTS = appointments;
  return { seed, appointments };
}

const HARNESS_WEEK_STARTS_ON = 1;
const HARNESS_HELD_STATUSES = ["UPCOMING", "OCCURRED", "NO_SHOW"];
const HARNESS_FREED_STATUSES = ["RE_SCHEDULED", "CANCELLED", "LATE_CANCELLATION"];
const HARNESS_SESSION_MINUTES = { ASSESSMENT_SESSION_1: 90, ASSESSMENT_SESSION_2: 90, THERAPY_INTAKE: 60, THERAPY_SIXTY_MINS: 60 };

function weekByOffset(day) {
  const [y, m, d] = day.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  const back = (new Date(midnight).getUTCDay() - HARNESS_WEEK_STARTS_ON + 7) % 7;
  return new Date(midnight - back * 86400000).toISOString().slice(0, 10);
}

class NotCheckable extends Error {}

function heldModel(rows, zone) {
  const held = [];
  const freed = [];
  const heldDay = {};
  const heldWeek = {};
  for (const row of rows) {
    const iso = new Date(row.scheduledFor).toISOString();
    if (!(row.appointmentType in HARNESS_SESSION_MINUTES)) throw new NotCheckable(`appointment ${row.id} has unknown type ${row.appointmentType}`);
    const entry = { id: row.id, scheduledFor: iso, appointmentType: row.appointmentType, status: row.status };
    if (HARNESS_FREED_STATUSES.includes(row.status)) {
      freed.push(entry);
      continue;
    }
    if (!HARNESS_HELD_STATUSES.includes(row.status)) throw new NotCheckable(`appointment ${row.id} has unknown status ${row.status}`);
    const start = Date.parse(iso);
    const day = localDayByOffset(iso, zone);
    const week = weekByOffset(day);
    held.push({ ...entry, start, end: start + HARNESS_SESSION_MINUTES[row.appointmentType] * 60000, day, week });
    heldDay[day] = (heldDay[day] || 0) + 1;
    heldWeek[week] = (heldWeek[week] || 0) + 1;
  }
  return { held, freed, heldDay, heldWeek };
}

module.exports = {
  findRepoRoot,
  parseArgs,
  defaultRunId,
  evidenceRoot,
  registerTsNode,
  toPlain,
  localDayByOffset,
  applySeedEnv,
  weekByOffset,
  HARNESS_HELD_STATUSES,
  HARNESS_SESSION_MINUTES,
  NotCheckable,
  heldModel,
};
