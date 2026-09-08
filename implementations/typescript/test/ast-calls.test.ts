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
