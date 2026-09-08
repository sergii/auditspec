import assert from "node:assert/strict";
import test from "node:test";
import { findAstCalls, pythonImportBindingsForScope } from "../src/ast-calls.js";

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

test("Ruby AST attaches calls to the owning method scope", () => {
  const source = [
    "class ApproveInvoice",
    "  def call",
    "    invoice.update!(status: 'approved')",
    "  end",
    "end",
  ].join("\n");
  const scan = findAstCalls(source, "ruby");
  const mutation = scan.calls.find((call) => call.method === "update!");
  assert.ok(mutation?.scope);
  assert.equal(mutation.scope.name, "call");
  assert.match(mutation.scope.qualified_name, /ApproveInvoice.*call/);
});

test("Ruby AST recognizes a standalone zero-argument send with a modifier", () => {
  const source = [
    "class ApplicationCable::Connection",
    "  def connect",
    "    reject_unauthorized_connection unless current_user",
    "  end",
    "end",
  ].join("\n");
  const scan = findAstCalls(source, "ruby");
  const rejection = scan.calls.find((call) => call.method === "reject_unauthorized_connection");
  assert.ok(rejection?.scope);
  assert.equal(rejection.scope.qualified_name, "ApplicationCable::Connection#connect");
});

test("Ruby AST does not turn a bound local variable into a zero-argument send", () => {
  const source = [
    "class Example",
    "  def call(reject_unauthorized_connection)",
    "    reject_unauthorized_connection",
    "  end",
    "",
    "  def other",
    "    reject_unauthorized_connection = true",
    "    reject_unauthorized_connection",
    "  end",
    "end",
  ].join("\n");
  const scan = findAstCalls(source, "ruby");
  assert.equal(
    scan.calls.some((call) => call.method === "reject_unauthorized_connection"),
    false,
  );
});

test("Ruby AST does not turn an identifier used as an argument into a zero-argument send", () => {
  const source = [
    "class Example",
    "  def call",
    "    log reject_unauthorized_connection",
    "  end",
    "end",
  ].join("\n");
  const scan = findAstCalls(source, "ruby");
  const matching = scan.calls.filter((call) => call.method === "reject_unauthorized_connection");
  assert.equal(matching.length, 0);
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

test("Python AST attaches calls to the owning function scope", () => {
  const source = [
    "import frappe",
    "def approve(name):",
    "    frappe.db.set_value('Project', name, 'status', 'Active')",
  ].join("\n");
  const scan = findAstCalls(source, "python");
  const mutation = scan.calls.find((call) => call.callee === "frappe.db.set_value");
  assert.ok(mutation?.scope);
  assert.equal(mutation.scope.name, "approve");
});

test("Python import scan distinguishes module and exact-scope from imports", () => {
  const source = [
    "from wiki.jobs import module_job as module_alias",
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import rebuild_index, cleanup as clean",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  const calls = findAstCalls(source, "python");
  const enqueue = calls.calls.find((call) => call.callee === "frappe.enqueue");
  assert.ok(enqueue?.scope);

  const imports = pythonImportBindingsForScope(source, enqueue.scope);
  assert.equal(imports.parsed, true);
  assert.equal(imports.complete, true);
  const actual = imports.bindings
    .map((binding) => [binding.owner, binding.local_name, binding.target] as const)
    .sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
  const expected = [
    ["module", "frappe", undefined],
    ["module", "module_alias", "wiki.jobs.module_job"],
    ["scope", "clean", "wiki.jobs.cleanup"],
    ["scope", "rebuild_index", "wiki.jobs.rebuild_index"],
  ] as const;
  assert.deepEqual(actual, expected);
});

test("Python import scan supports multiline aliases but keeps relative imports unresolved", () => {
  const source = [
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import (",
    "        rebuild_index,",
    "        cleanup as clean,",
    "    )",
    "    from .local_jobs import relative_job",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  const calls = findAstCalls(source, "python");
  const enqueue = calls.calls.find((call) => call.callee === "frappe.enqueue");
  assert.ok(enqueue?.scope);

  const imports = pythonImportBindingsForScope(source, enqueue.scope);
  assert.equal(imports.complete, true);
  const rebuild = imports.bindings.find((binding) => binding.local_name === "rebuild_index");
  const clean = imports.bindings.find((binding) => binding.local_name === "clean");
  const relative = imports.bindings.find((binding) => binding.local_name === "relative_job");
  assert.equal(rebuild?.target, "wiki.jobs.rebuild_index");
  assert.equal(clean?.target, "wiki.jobs.cleanup");
  assert.equal(relative?.target, undefined);
});

test("Python import scan preserves conditional bindings as indirect but excludes neighboring scopes", () => {
  const source = [
    "import frappe",
    "def other():",
    "    from wiki.jobs import neighboring_job",
    "    return neighboring_job",
    "",
    "def schedule(enabled):",
    "    if enabled:",
    "        from wiki.jobs import conditional_job",
    "    frappe.enqueue(conditional_job)",
  ].join("\n");
  const calls = findAstCalls(source, "python");
  const enqueue = calls.calls.find((call) => call.callee === "frappe.enqueue");
  assert.ok(enqueue?.scope);

  const imports = pythonImportBindingsForScope(source, enqueue.scope);
  assert.equal(imports.complete, true);
  const conditional = imports.bindings.find((binding) => binding.local_name === "conditional_job");
  assert.equal(conditional?.owner, "scope");
  assert.equal(conditional?.direct, false);
  assert.equal(conditional?.target, "wiki.jobs.conditional_job");
  assert.equal(imports.bindings.some((binding) => binding.local_name === "neighboring_job"), false);
});

test("Python import scan records wildcard imports without inventing a binding", () => {
  const source = [
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import *",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  const calls = findAstCalls(source, "python");
  const enqueue = calls.calls.find((call) => call.callee === "frappe.enqueue");
  assert.ok(enqueue?.scope);

  const imports = pythonImportBindingsForScope(source, enqueue.scope);
  assert.equal(imports.complete, true);
  assert.equal(imports.wildcard_in_scope, true);
  assert.equal(imports.bindings.some((binding) => binding.local_name === "rebuild_index"), false);
});
