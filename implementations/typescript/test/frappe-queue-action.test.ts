import assert from "node:assert/strict";
import test from "node:test";
import { frappeDocumentHookDispatches } from "../src/frappe-document-hooks.js";

function queueDispatches(source: string, methods: Array<{ name: string; qualified_name: string; line: number }>) {
  return frappeDocumentHookDispatches(
    source,
    "wiki/wiki/doctype/wiki_page/wiki_page.py",
    methods,
  ).filter((dispatch) => dispatch.surface_kind === "frappe_queue_action");
}

test("resolves literal self.queue_action to a method on the same Document controller", () => {
  const source = [
    "from frappe.model.document import Document",
    "",
    "class WikiPage(Document):",
    "    def on_update(self):",
    "        self.queue_action('rebuild_index', queue='long')",
    "",
    "    def rebuild_index(self):",
    "        self.db_set('status', 'Indexed')",
  ].join("\n");

  const dispatches = queueDispatches(source, [
    { name: "on_update", qualified_name: "WikiPage.on_update", line: 4 },
    { name: "rebuild_index", qualified_name: "WikiPage.rebuild_index", line: 7 },
  ]);

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0]?.target_qualified_name, "WikiPage.rebuild_index");
  assert.equal(
    dispatches[0]?.detail,
    "QUEUE_ACTION WikiPage.on_update -> WikiPage.rebuild_index [action=rebuild_index]",
  );
});

test("supports a literal action keyword", () => {
  const source = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action(action='rebuild_index', enqueue_after_commit=True)",
    "",
    "    def rebuild_index(self):",
    "        self.db_set('status', 'Indexed')",
  ].join("\n");

  const dispatches = queueDispatches(source, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "rebuild_index", qualified_name: "WikiPage.rebuild_index", line: 5 },
  ]);
  assert.equal(dispatches[0]?.target_qualified_name, "WikiPage.rebuild_index");
});

test("prefers a controller-defined inner action exactly like Frappe queue_action", () => {
  const source = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action('rebuild_index')",
    "",
    "    def rebuild_index(self):",
    "        self.db_set('status', 'Wrong')",
    "",
    "    def _rebuild_index(self):",
    "        self.db_set('status', 'Indexed')",
  ].join("\n");

  const dispatches = queueDispatches(source, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "rebuild_index", qualified_name: "WikiPage.rebuild_index", line: 5 },
    { name: "_rebuild_index", qualified_name: "WikiPage._rebuild_index", line: 8 },
  ]);
  assert.equal(dispatches[0]?.target_qualified_name, "WikiPage._rebuild_index");
});

test("fails closed for dynamic, external-instance, starred, and duplicate action identity", () => {
  const dynamic = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action(self.next_action)",
    "    def rebuild_index(self):",
    "        self.db_set('status', 'Indexed')",
  ].join("\n");
  assert.deepEqual(queueDispatches(dynamic, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "rebuild_index", qualified_name: "WikiPage.rebuild_index", line: 4 },
  ]), []);

  const external = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        doc.queue_action('rebuild_index')",
    "    def rebuild_index(self):",
    "        self.db_set('status', 'Indexed')",
  ].join("\n");
  assert.deepEqual(queueDispatches(external, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "rebuild_index", qualified_name: "WikiPage.rebuild_index", line: 4 },
  ]), []);

  const starred = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action(*args)",
  ].join("\n");
  assert.deepEqual(queueDispatches(starred, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
  ]), []);

  const duplicate = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action('rebuild_index', action='rebuild_index')",
    "    def rebuild_index(self):",
    "        self.db_set('status', 'Indexed')",
  ].join("\n");
  assert.deepEqual(queueDispatches(duplicate, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "rebuild_index", qualified_name: "WikiPage.rebuild_index", line: 4 },
  ]), []);
});

test("does not misresolve Frappe inherited inner actions to same-named controller methods", () => {
  const source = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action('submit')",
    "",
    "    def submit(self):",
    "        self.db_set('status', 'Submitted')",
  ].join("\n");

  assert.deepEqual(queueDispatches(source, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "submit", qualified_name: "WikiPage.submit", line: 5 },
  ]), []);
});

test("resolves an explicitly overridden inherited inner action", () => {
  const source = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.queue_action('submit')",
    "",
    "    def _submit(self):",
    "        self.db_set('status', 'Submitted')",
  ].join("\n");

  const dispatches = queueDispatches(source, [
    { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    { name: "_submit", qualified_name: "WikiPage._submit", line: 5 },
  ]);
  assert.equal(dispatches[0]?.target_qualified_name, "WikiPage._submit");
});
