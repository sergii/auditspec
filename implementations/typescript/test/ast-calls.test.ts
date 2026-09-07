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

test("diagnoses explicit namespaced Ruby scope qualification", () => {
  const controller = [
    "class Admin::BaseController < ApplicationController",
    "  def authorize_admin",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  const concern = [
    "module Admin::AuthorizationConcern",
    "  extend ActiveSupport::Concern",
    "  def authorize_request",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");

  const controllerScopes = findAstCalls(controller, "ruby").calls
    .filter((call) => call.scope)
    .map((call) => ({ method: call.method, scope: call.scope!.qualified_name }));
  const concernScopes = findAstCalls(concern, "ruby").calls
    .filter((call) => call.scope)
    .map((call) => ({ method: call.method, scope: call.scope!.qualified_name }));

  console.log("AUDITSPEC_NAMESPACED_CONTROLLER_SCOPES", JSON.stringify(controllerScopes));
  console.log("AUDITSPEC_NAMESPACED_CONCERN_SCOPES", JSON.stringify(concernScopes));
  assert.ok(controllerScopes.length > 0);
  assert.ok(concernScopes.length > 0);
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
