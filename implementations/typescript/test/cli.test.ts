import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("CLI creates, validates, and explains an external implementer starter event", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-cli-quickstart-"));
  const eventPath = join(root, "audit-event.json");

  try {
    const init = run("init-example", eventPath);
    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /Created .*audit-event\.json/);

    const generated = JSON.parse(readFileSync(eventPath, "utf8")) as {
      spec_version: string;
      action: string;
    };
    assert.equal(generated.spec_version, "0.1");
    assert.equal(generated.action, "invoice.pay");

    const validate = run("validate", eventPath, "--human");
    assert.equal(validate.status, 0, validate.stderr);
    assert.match(
      validate.stdout,
      /PASS .*audit-event\.json - valid AuditSpec Core 0\.1 event/,
    );

    const explain = run("explain", eventPath);
    assert.equal(explain.status, 0, explain.stderr);
    assert.match(explain.stdout, /Actor: service:billing/);
    assert.match(explain.stdout, /Action: invoice\.pay/);
    assert.match(explain.stdout, /Authorization: allowed/);
    assert.match(explain.stdout, /Result: succeeded/);
    assert.match(explain.stdout, /Evidence: 2 record\(s\)/);

    const explainJson = run("explain", eventPath, "--json");
    assert.equal(explainJson.status, 0, explainJson.stderr);
    assert.match(explainJson.stdout, /"core_spec_version": "0\.1"/);
    assert.match(explainJson.stdout, /"actor": "service:billing"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI init-example refuses accidental overwrite unless --force is explicit", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-cli-quickstart-overwrite-"));
  const eventPath = join(root, "audit-event.json");

  try {
    writeFileSync(eventPath, "{\"sentinel\":true}\n", "utf8");

    const refused = run("init-example", eventPath);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Refusing to overwrite existing file/);
    assert.match(readFileSync(eventPath, "utf8"), /sentinel/);

    const forced = run("init-example", eventPath, "--force");
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(readFileSync(eventPath, "utf8"), /"aud_quickstart_001"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI human validation reports concise failure and exits non-zero", () => {
  const result = run(
    "validate",
    "conformance/invalid/missing-actor.json",
    "--human",
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^FAIL .*missing-actor\.json - \d+ validation error\(s\)/);
  assert.match(result.stdout, /required property/);
});

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

test("CLI reports Assurance Graph topology changes", () => {
  const base = mkdtempSync(join(tmpdir(), "auditspec-cli-graph-base-"));
  const head = mkdtempSync(join(tmpdir(), "auditspec-cli-graph-head-"));
  try {
    for (const root of [base, head]) mkdirSync(join(root, "app/services"), { recursive: true });
    writeFileSync(
      join(base, "app/services/refund_service.rb"),
      [
        "class RefundService",
        "  def self.call(refund)",
        "    refund.update!(status: 'refunded')",
        "  end",
        "end",
      ].join("\n"),
    );
    writeFileSync(
      join(head, "app/services/refund_service.rb"),
      [
        "class RefundService",
        "  def self.call(refund)",
        "    refund.update!(status: 'refunded')",
        "  end",
        "end",
      ].join("\n"),
    );
    mkdirSync(join(head, "app/controllers"), { recursive: true });
    mkdirSync(join(head, "config"), { recursive: true });
    writeFileSync(join(head, "config/routes.rb"), "post '/refunds/:id', to: 'refunds#perform'\n");
    writeFileSync(
      join(head, "app/controllers/refunds_controller.rb"),
      [
        "class RefundsController < ApplicationController",
        "  def perform",
        "    RefundService.call(refund)",
        "  end",
        "end",
      ].join("\n"),
    );

    const result = run("graph-diff", base, head);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"diff_version": "0.1"/);
    assert.match(result.stdout, /"new_entrypoints"/);
    assert.match(result.stdout, /"new_mutation_paths"/);
    assert.match(result.stdout, /RefundService#call/);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(head, { recursive: true, force: true });
  }
});

test("CLI exports OSCAL from one validated request object", () => {
  const result = run(
    "export-oscal",
    "schema/examples/assessment-report.json",
    "schema/examples/oscal-export-request.json",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"assessment-results"/);
  assert.match(result.stdout, /"reviewed-controls"/);
  assert.match(result.stdout, /"target-id": "au-2_smt"/);
  assert.match(result.stdout, /"state": "not-satisfied"/);
});
