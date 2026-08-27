import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [beforeArg, afterArg] = process.argv.slice(2);
if (!beforeArg || !afterArg) {
  throw new Error("Usage: node compare-temp-operational-baselines.mjs <before.json> <after.json>");
}

const before = JSON.parse(await readFile(resolve(beforeArg), "utf8"));
const after = JSON.parse(await readFile(resolve(afterArg), "utf8"));
delete before.captured_at;
delete after.captured_at;

const differences = [];
function compare(left, right, path = "root") {
  const keys = new Set([
    ...Object.keys(left && typeof left === "object" ? left : {}),
    ...Object.keys(right && typeof right === "object" ? right : {}),
  ]);
  if (!keys.size) {
    if (JSON.stringify(left) !== JSON.stringify(right)) differences.push({ path, before: left, after: right });
    return;
  }
  for (const key of [...keys].sort()) {
    const next = `${path}.${key}`;
    const l = left?.[key];
    const r = right?.[key];
    if (l && r && typeof l === "object" && typeof r === "object") compare(l, r, next);
    else if (JSON.stringify(l) !== JSON.stringify(r)) differences.push({ path: next, before: l, after: r });
  }
}

compare(before, after);
console.log(JSON.stringify({ equal: differences.length === 0, difference_count: differences.length, differences }, null, 2));
if (differences.length) process.exitCode = 2;
