import assert from "node:assert/strict";
import test from "node:test";
import { frappeImportedEnqueueTarget, frappeLocalEnqueueReference } from "../src/frappe-enqueue-local.js";

function reference(source: string, callText: string, startLine = 4, endLine = 5): string | undefined {
  return frappeLocalEnqueueReference({
    call_text: callText,
    source,
    scope_start_line: startLine,
    scope_end_line: endLine,
  });
}

function importedTarget(
  source: string,
  callText: string,
  callLine: number,
  startLine = 2,
  endLine = callLine,
): string | undefined {
  return frappeImportedEnqueueTarget({
    call_text: callText,
    source,
    scope_start_line: startLine,
    scope_end_line: endLine,
    call_line: callLine,
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

test("resolves a direct scope-local absolute from-import target", () => {
  const source = [
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import rebuild_index",
    "    frappe.enqueue(rebuild_index, queue='long')",
  ].join("\n");

  assert.equal(
    importedTarget(source, "frappe.enqueue(rebuild_index, queue='long')", 4, 2, 4),
    "wiki.jobs.rebuild_index",
  );
});

test("resolves an imported alias through method=", () => {
  const source = [
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import rebuild_index as job",
    "    frappe.enqueue(method=job, queue='long')",
  ].join("\n");

  assert.equal(
    importedTarget(source, "frappe.enqueue(method=job, queue='long')", 4, 2, 4),
    "wiki.jobs.rebuild_index",
  );
});

test("imported enqueue resolution fails closed for conditional, relative, duplicate, or late scope imports", () => {
  const conditional = [
    "import frappe",
    "def schedule(enabled):",
    "    if enabled:",
    "        from wiki.jobs import rebuild_index",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(conditional, "frappe.enqueue(rebuild_index)", 5, 2, 5), undefined);

  const relative = [
    "import frappe",
    "def schedule():",
    "    from .jobs import rebuild_index",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(relative, "frappe.enqueue(rebuild_index)", 4, 2, 4), undefined);

  const duplicate = [
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import rebuild_index",
    "    from other.jobs import rebuild_index",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(duplicate, "frappe.enqueue(rebuild_index)", 5, 2, 5), undefined);

  const late = [
    "import frappe",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
    "    from wiki.jobs import rebuild_index",
  ].join("\n");
  assert.equal(importedTarget(late, "frappe.enqueue(rebuild_index)", 3, 2, 4), undefined);
});

test("scope-local imported enqueue resolution fails closed when the imported name is otherwise rebound", () => {
  const source = [
    "import frappe",
    "def schedule():",
    "    from wiki.jobs import rebuild_index",
    "    rebuild_index = choose_job()",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");

  assert.equal(importedTarget(source, "frappe.enqueue(rebuild_index)", 5, 2, 5), undefined);
});

test("resolves a direct module-level absolute from-import target", () => {
  const source = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "",
    "def schedule():",
    "    frappe.enqueue(rebuild_index, queue='long')",
  ].join("\n");

  assert.equal(
    importedTarget(source, "frappe.enqueue(rebuild_index, queue='long')", 5, 4, 5),
    "wiki.jobs.rebuild_index",
  );
});

test("resolves a module-level imported alias through method=", () => {
  const source = [
    "import frappe",
    "from wiki.jobs import rebuild_index as job",
    "",
    "def schedule():",
    "    frappe.enqueue(method=job, queue='long')",
  ].join("\n");

  assert.equal(
    importedTarget(source, "frappe.enqueue(method=job, queue='long')", 5, 4, 5),
    "wiki.jobs.rebuild_index",
  );
});

test("module-level imported enqueue resolution fails closed for caller-local shadowing", () => {
  const parameter = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "",
    "def schedule(rebuild_index):",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(parameter, "frappe.enqueue(rebuild_index)", 5, 4, 5), undefined);

  const assignment = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "",
    "def schedule():",
    "    rebuild_index = choose_job()",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(assignment, "frappe.enqueue(rebuild_index)", 6, 4, 6), undefined);
});

test("module-level imported enqueue resolution fails closed for conditional, relative, duplicate, or late imports", () => {
  const conditional = [
    "import frappe",
    "if ENABLED:",
    "    from wiki.jobs import rebuild_index",
    "",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(conditional, "frappe.enqueue(rebuild_index)", 6, 5, 6), undefined);

  const relative = [
    "import frappe",
    "from .jobs import rebuild_index",
    "",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(relative, "frappe.enqueue(rebuild_index)", 5, 4, 5), undefined);

  const duplicate = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "from other.jobs import rebuild_index",
    "",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(duplicate, "frappe.enqueue(rebuild_index)", 6, 5, 6), undefined);

  const late = [
    "import frappe",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
    "",
    "from wiki.jobs import rebuild_index",
  ].join("\n");
  assert.equal(importedTarget(late, "frappe.enqueue(rebuild_index)", 3, 2, 3), undefined);
});

test("module-level imported enqueue resolution fails closed when the global is rebound later", () => {
  const beforeCaller = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "rebuild_index = choose_job()",
    "",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
  ].join("\n");
  assert.equal(importedTarget(beforeCaller, "frappe.enqueue(rebuild_index)", 6, 5, 6), undefined);

  const afterCaller = [
    "import frappe",
    "from wiki.jobs import rebuild_index",
    "",
    "def schedule():",
    "    frappe.enqueue(rebuild_index)",
    "",
    "rebuild_index = choose_job()",
  ].join("\n");
  assert.equal(importedTarget(afterCaller, "frappe.enqueue(rebuild_index)", 5, 4, 5), undefined);
});
