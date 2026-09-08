import assert from "node:assert/strict";
import test from "node:test";
import { frappeLocalEnqueueReference } from "../src/frappe-enqueue-local.js";

function reference(source: string, callText: string, startLine = 4, endLine = 5): string | undefined {
  return frappeLocalEnqueueReference({
    call_text: callText,
    source,
    scope_start_line: startLine,
    scope_end_line: endLine,
  });
}

test("resolves a positional same-module function reference", () => {
  const source = [
    "import frappe",
    "def rebuild_index():",
    "    pass",
    "def schedule():",
    "    frappe.enqueue(rebuild_index, queue='long')",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(rebuild_index, queue='long')"), "rebuild_index");
});

test("resolves a method keyword same-module function reference", () => {
  const source = [
    "import frappe",
    "def rebuild_index():",
    "    pass",
    "def schedule():",
    "    frappe.enqueue(method=rebuild_index, queue='long')",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(method=rebuild_index, queue='long')"), "rebuild_index");
});

test("fails closed when the reference is a caller parameter", () => {
  const source = [
    "import frappe",
    "def rebuild_index():",
    "    pass",
    "def schedule(rebuild_index):",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(rebuild_index)"), undefined);
});

test("fails closed when the reference is locally rebound", () => {
  const source = [
    "import frappe",
    "def rebuild_index():",
    "    pass",
    "def schedule():",
    "    rebuild_index = choose_job()",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(rebuild_index)", 4, 6), undefined);
});

test("fails closed when the module name is rebound or imported", () => {
  const assigned = [
    "import frappe",
    "rebuild_index = external_job",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(reference(assigned, "frappe.enqueue(rebuild_index)", 3, 4), undefined);

  const imported = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(reference(imported, "frappe.enqueue(rebuild_index)", 3, 4), undefined);
});

test("fails closed when an exact-scope import shadows a same-module function", () => {
  const source = [
    "import frappe",
    "def rebuild_index():",
    "    pass",
    "def schedule():",
    "    from wiki.jobs import rebuild_index",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(rebuild_index)", 4, 6), undefined);
});

test("fails closed when a wildcard import could bind the bare reference", () => {
  const source = [
    "import frappe",
    "def rebuild_index():",
    "    pass",
    "def schedule():",
    "    from wiki.jobs import *",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(rebuild_index)", 4, 6), undefined);
});

test("fails closed for dotted, called, and starred target expressions", () => {
  const source = [
    "import frappe",
    "def schedule():",
    "    pass",
  ].join("\n");

  assert.equal(reference(source, "frappe.enqueue(jobs.rebuild_index)", 2, 3), undefined);
  assert.equal(reference(source, "frappe.enqueue(factory())", 2, 3), undefined);
  assert.equal(reference(source, "frappe.enqueue(*args)", 2, 3), undefined);
});
