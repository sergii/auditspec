import assert from "node:assert/strict";
import test from "node:test";
import { findAstCalls } from "../src/ast-calls.js";
import { isFrappeWhitelistedScope } from "../src/frappe-whitelist.js";

function scopeForMutation(source: string, method: string) {
  const scan = findAstCalls(source, "python");
  assert.equal(scan.parsed, true);
  const call = scan.calls.find((candidate) => candidate.method === method);
  assert.ok(call?.scope);
  return call.scope;
}

test("attributes a direct frappe.whitelist decorator to its function", () => {
  const source = [
    "import frappe",
    "@frappe.whitelist(allow_guest=True)",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), true);
});

test("attributes frappe.whitelist through a contiguous stacked decorator block", () => {
  const source = [
    "import frappe",
    "@frappe.whitelist()",
    "@validate_request",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), true);
});

test("does not inherit a whitelist decorator from a neighboring function", () => {
  const source = [
    "import frappe",
    "@frappe.whitelist()",
    "def public_ping():",
    "    frappe.logger().info('ping')",
    "",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), false);
});

test("fails closed when decorator attribution requires multiline parsing", () => {
  const source = [
    "import frappe",
    "@frappe.whitelist(",
    "    allow_guest=True,",
    ")",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), false);
});
