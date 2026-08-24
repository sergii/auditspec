import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

test("CLI builds and queries an Assurance Graph", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-cli-graph-"));
  try {
    mkdirSync(join(root, "app/controllers"), { recursive: true });
    mkdirSync(join(root, "app/services"), { recursive: true });
    writeFileSync(
      join(root, "app/controllers/invoices_controller.rb"),
      [
        "class InvoicesController < ApplicationController",
        "  def approve",
        "    authorize(invoice)",
        "    ApproveInvoice.call(invoice)",
        "  end",
        "end",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "app/services/approve_invoice.rb"),
      [
        "class ApproveInvoice",
        "  def self.call(invoice)",
        "    ApplicationRecord.transaction do",
        "      invoice.update!(status: 'approved')",
        "      AuditSpec.emit!(action: 'invoice.approve')",
        "    end",
        "  end",
        "end",
      ].join("\n"),
    );

    const graph = run("graph", root);
    assert.equal(graph.status, 0, graph.stderr);
    assert.match(graph.stdout, /"graph_version": "0.1"/);
    assert.match(graph.stdout, /"ApproveInvoice#call"/);

    const path = run("assurance-path", root, "app/services/approve_invoice.rb", "4");
    assert.equal(path.status, 0, path.stderr);
    assert.match(path.stdout, /"found": true/);
    assert.match(path.stdout, /"transaction"/);
    assert.match(path.stdout, /"audit"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
