import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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

test("CLI validates a valid AuditSpec event", () => {
  const result = run("validate", "conformance/valid/user-action.json");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"valid": true/);
});

test("CLI rejects an invalid AuditSpec event", () => {
  const result = run("validate", "conformance/invalid/missing-actor.json");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /"valid": false/);
});

test("CLI maps a valid event to CloudEvents", () => {
  const result = run("to-cloudevent", "conformance/valid/agent-action.json");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"specversion": "1.0"/);
  assert.match(result.stdout, /"auditspecversion": "0.1"/);
});
