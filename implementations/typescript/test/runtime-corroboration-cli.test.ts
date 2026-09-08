import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

test("CLI corroborates an assessment with validated runtime evidence records", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-runtime-cli-"));
  try {
    const evidence = JSON.parse(
      readFileSync(resolve(repoRoot, "schema/examples/runtime-evidence-record.json"), "utf8"),
    ) as unknown;
    const evidencePath = join(root, "evidence.json");
    writeFileSync(evidencePath, JSON.stringify([evidence]));

    const result = run(
      "corroborate",
      "schema/examples/assessment-report.json",
      evidencePath,
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      report_version: string;
      summary: { supports: number; matched: number };
    };
    assert.equal(report.report_version, "0.1");
    assert.equal(report.summary.matched, 1);
    assert.equal(report.summary.supports, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI rejects a runtime evidence array containing an invalid record", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-runtime-cli-invalid-"));
  try {
    const evidencePath = join(root, "evidence.json");
    writeFileSync(evidencePath, JSON.stringify([{ record_version: "0.1" }]));

    const result = run(
      "corroborate",
      "schema/examples/assessment-report.json",
      evidencePath,
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid AuditSpec runtime evidence record/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
