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

test("CLI validates an implementer corpus with human and JSON summaries", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-cli-corpus-"));
  try {
    mkdirSync(join(root, "nested"), { recursive: true });

    const firstPath = join(root, "valid.json");
    const secondPath = join(root, "nested", "valid-2.json");
    assert.equal(run("init-example", firstPath).status, 0);
    assert.equal(run("init-example", secondPath).status, 0);

    const invalid = JSON.parse(readFileSync(firstPath, "utf8")) as Record<string, unknown>;
    delete invalid.actor;
    writeFileSync(
      join(root, "invalid.json"),
      `${JSON.stringify(invalid, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(join(root, "notes.txt"), "ignored\n", "utf8");

    const human = run("conformance", root);
    assert.equal(human.status, 1);
    assert.match(human.stdout, /^AuditSpec conformance\nCore: 0\.1/m);
    assert.match(human.stdout, /Events: 3/);
    assert.match(human.stdout, /Valid: 2/);
    assert.match(human.stdout, /Invalid: 1/);
    assert.match(human.stdout, /Result: FAIL/);
    assert.match(human.stdout, /FAIL invalid\.json/);

    const machine = run("conformance", root, "--json");
    assert.equal(machine.status, 1);
    const report = JSON.parse(machine.stdout) as {
      passed: boolean;
      summary: { total: number; valid: number; invalid: number };
      files: Array<{ path: string }>;
    };
    assert.equal(report.passed, false);
    assert.deepEqual(report.summary, {
      total: 3,
      valid: 2,
      invalid: 1,
      parse_errors: 0,
    });
    assert.deepEqual(
      report.files.map((item) => item.path),
      ["invalid.json", "nested/valid-2.json", "valid.json"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI conformance passes a non-empty all-valid corpus", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-cli-corpus-pass-"));
  try {
    assert.equal(run("init-example", join(root, "event.json")).status, 0);

    const result = run("conformance", root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Events: 1/);
    assert.match(result.stdout, /Valid: 1/);
    assert.match(result.stdout, /Invalid: 0/);
    assert.match(result.stdout, /Result: PASS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI conformance rejects an empty corpus", () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-cli-corpus-empty-"));
  try {
    writeFileSync(join(root, "README.md"), "no events\n", "utf8");

    const result = run("conformance", root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Events: 0/);
    assert.match(result.stdout, /Result: FAIL/);
    assert.match(result.stdout, /no JSON event files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
