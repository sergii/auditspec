import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const cli = resolve(packageRoot, "dist/cli.js");

test("CLI queries runtime corroboration by relation, trust, and producer type", () => {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "query-corroboration",
      "schema/examples/corroboration-report.json",
      "--relation",
      "supports",
      "--trust",
      "authoritative",
      "--producer-type",
      "database",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"query_version": "0.1"/);
  assert.match(result.stdout, /"count": 1/);
  assert.match(result.stdout, /"name": "postgres-audit-observer"/);
});
