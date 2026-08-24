import assert from "node:assert/strict";
import test from "node:test";
import { findAstCalls } from "../src/ast-calls.js";

test("Ruby AST returns real calls but ignores mutation-looking comments and strings", () => {
  const source = [
    "# refund.update!(status: 'fake')",
    'message = "refund.destroy!"',
    "refund.update!(status: 'real')",
  ].join("\n");
  const scan = findAstCalls(source, "ruby");
  assert.equal(scan.parsed, true);
  assert.ok(scan.calls.some((call) => call.method === "update!"));
  assert.ok(!scan.calls.some((call) => call.method === "destroy!"));
});

test("Python AST exposes full call targets", () => {
  const source = [
    "import frappe",
    "# frappe.db.delete('Fake')",
    "frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");
  const scan = findAstCalls(source, "python");
  assert.equal(scan.parsed, true);
  assert.ok(scan.calls.some((call) => call.callee === "frappe.db.set_value"));
  assert.ok(!scan.calls.some((call) => call.callee === "frappe.db.delete"));
});
