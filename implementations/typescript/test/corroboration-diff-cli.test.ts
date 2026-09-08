import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const cli = resolve(packageRoot, "dist/cli.js");

function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("CLI diffs schema-valid Runtime Corroboration Reports and exposes comparability", () => {
  const result = run(
    "diff-corroboration",
    "schema/examples/corroboration-report.json",
    "schema/examples/corroboration-report.json",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"diff_version": "0.1"/);
  assert.match(result.stdout, /"status": "comparable"/);
  assert.match(result.stdout, /"newly_reported": 0/);
  assert.match(result.stdout, /"no_longer_reported": 0/);
});
