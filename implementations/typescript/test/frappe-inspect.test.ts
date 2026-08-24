import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectRepository } from "../src/inspect.js";
import { validateAssessmentReport } from "../src/validate.js";

async function makeFrappeRepo(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-"));
  await mkdir(join(root, "example_app", "api"), { recursive: true });
  await writeFile(join(root, "example_app", "hooks.py"), 'app_name = "example_app"\n');
  await writeFile(join(root, "example_app", "api", "project.py"), source);
  return root;
}

test("Inspector detects unaudited Frappe direct database mutation", async () => {
  const root = await makeFrappeRepo(`
import frappe

def activate(name):
    frappe.db.set_value("Project", name, "status", "Active")
`);

  const report = await inspectRepository(root);
  assert.ok(report.frameworks.some((framework) => framework.name === "frappe"));
  assert.ok(report.inspector.adapters.includes("frappe-ast-assisted-v0.1"));
  assert.ok(report.findings.some((finding) => finding.rule_id === "AS-AUDIT-001"));
  assert.equal(report.boundaries[0]?.evidence?.[0]?.kind, "ast_call");
  assert.equal(validateAssessmentReport(report).valid, true);
});

test("Inspector marks visible Frappe semantic audit as partial rather than proven atomic", async () => {
  const root = await makeFrappeRepo(`
import frappe
import auditspec

def activate(name):
    frappe.db.set_value("Project", name, "status", "Active")
    auditspec.emit(action="project.activate")
`);

  const report = await inspectRepository(root);
  assert.equal(report.boundaries.length, 1);
  assert.equal(report.boundaries[0]?.audit_status, "partial");
  assert.ok(!report.findings.some((finding) => finding.rule_id === "AS-AUDIT-001"));
});

test("Inspector detects Frappe delete, bulk update, db_set and delete_doc surfaces", async () => {
  const root = await makeFrappeRepo(`
import frappe

def mutate(doc):
    frappe.db.delete("ToDo", {"status": "Closed"})
    frappe.db.bulk_update("Task", {"TASK-1": {"status": "Closed"}})
    doc.db_set("status", "Closed")
    frappe.delete_doc("Note", "NOTE-1")
`);

  const report = await inspectRepository(root);
  const operations = new Set(report.boundaries.map((boundary) => boundary.operation));
  assert.ok(operations.has("frappe.db.delete"));
  assert.ok(operations.has("frappe.db.bulk_update"));
  assert.ok(operations.has("db_set"));
  assert.ok(operations.has("frappe.delete_doc"));
});

test("Inspector flags truncate as an irreversible atomicity boundary", async () => {
  const root = await makeFrappeRepo(`
import frappe

def clear_logs():
    frappe.db.truncate("Error Log")
`);

  const report = await inspectRepository(root);
  const atomicity = report.findings.find((finding) => finding.rule_id === "AS-ATOMIC-001");
  assert.equal(atomicity?.confidence, "certain");
});

test("Inspector ignores mutation-looking Python comments", async () => {
  const root = await makeFrappeRepo(`
import frappe

def noop():
    # frappe.db.delete("ToDo", {})
    return "frappe.db.set_value('Project', 'X', 'status', 'Fake')"
`);
  const report = await inspectRepository(root);
  assert.equal(report.boundaries.length, 0);
});
