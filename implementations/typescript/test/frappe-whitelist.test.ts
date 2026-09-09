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

test("attributes frappe.whitelist through a stacked decorator block", () => {
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

test("attributes multiline frappe.whitelist arguments through the decorated AST node", () => {
  const source = [
    "import frappe",
    "@frappe.whitelist(",
    "    allow_guest=True,",
    "    methods=['POST'],",
    ")",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), true);
});

test("attributes a proven from-import alias for frappe.whitelist", () => {
  const source = [
    "from frappe import whitelist as api",
    "",
    "@api(allow_guest=True)",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), true);
});

test("attributes a proven imported frappe module alias", () => {
  const source = [
    "import frappe as f",
    "",
    "@f.whitelist()",
    "def update_project(name):",
    "    f.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), true);
});

test("attributes a directly imported frappe whitelist name", () => {
  const source = [
    "from frappe import whitelist",
    "",
    "@whitelist()",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), true);
});

test("fails closed when a whitelist alias is rebound before the definition", () => {
  const source = [
    "from frappe import whitelist as api",
    "api = custom_decorator",
    "",
    "@api()",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), false);
});

test("fails closed for a conditional whitelist alias import", () => {
  const source = [
    "if FEATURE_ENABLED:",
    "    from frappe import whitelist as api",
    "",
    "@api()",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), false);
});

test("fails closed for an alias imported from a different module", () => {
  const source = [
    "from custom_api import whitelist as api",
    "",
    "@api()",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), false);
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

test("does not treat a different decorator as a Frappe whitelist", () => {
  const source = [
    "import frappe",
    "@custom.whitelist()",
    "def update_project(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");

  const scope = scopeForMutation(source, "set_value");
  assert.equal(isFrappeWhitelistedScope(source, scope), false);
});
