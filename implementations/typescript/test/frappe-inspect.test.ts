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
  assert.ok(report.inspector.adapters.includes("frappe-heuristic-v0.1"));
  assert.ok(report.findings.some((finding) => finding.rule_id === "AS-AUDIT-001"));
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
