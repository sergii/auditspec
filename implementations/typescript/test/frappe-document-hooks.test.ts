import assert from "node:assert/strict";
import test from "node:test";
import { frappeDocumentHookDispatches } from "../src/frappe-document-hooks.js";

test("resolves documented hooks on a conventional explicit Document controller", () => {
  const source = [
    "from frappe.model.document import Document",
    "",
    "class WikiPage(Document):",
    "    def validate(self):",
    "        frappe.throw('invalid')",
    "",
    "    def on_update(self):",
    "        self.notify_update()",
    "",
    "    def helper(self):",
    "        self.notify_update()",
  ].join("\n");

  const dispatches = frappeDocumentHookDispatches(
    source,
    "wiki/wiki/doctype/wiki_page/wiki_page.py",
    [
      { name: "validate", qualified_name: "WikiPage.validate", line: 4 },
      { name: "on_update", qualified_name: "WikiPage.on_update", line: 7 },
      { name: "helper", qualified_name: "WikiPage.helper", line: 10 },
    ],
  );

  assert.deepEqual(dispatches.map(({ detail, target_qualified_name }) => ({ detail, target_qualified_name })), [
    {
      detail: "DOCUMENT_HOOK validate -> WikiPage.validate",
      target_qualified_name: "WikiPage.validate",
    },
    {
      detail: "DOCUMENT_HOOK on_update -> WikiPage.on_update",
      target_qualified_name: "WikiPage.on_update",
    },
  ]);
});

test("supports an explicit fully-qualified Document base", () => {
  const source = [
    "class WikiPage(frappe.model.document.Document):",
    "    def before_save(self):",
    "        self.normalize()",
  ].join("\n");

  const dispatches = frappeDocumentHookDispatches(
    source,
    "wiki/wiki/doctype/wiki_page/wiki_page.py",
    [{ name: "before_save", qualified_name: "WikiPage.before_save", line: 2 }],
  );
  assert.equal(dispatches.length, 1);
});

test("does not treat storage primitives or arbitrary methods as controller hooks", () => {
  const source = [
    "class WikiPage(Document):",
    "    def db_update(self):",
    "        self.persist()",
    "",
    "    def save(self):",
    "        self.persist()",
    "",
    "    def helper(self):",
    "        self.persist()",
  ].join("\n");

  const dispatches = frappeDocumentHookDispatches(
    source,
    "wiki/wiki/doctype/wiki_page/wiki_page.py",
    [
      { name: "db_update", qualified_name: "WikiPage.db_update", line: 2 },
      { name: "save", qualified_name: "WikiPage.save", line: 5 },
      { name: "helper", qualified_name: "WikiPage.helper", line: 8 },
    ],
  );
  assert.deepEqual(dispatches, []);
});

test("fails closed outside the conventional DocType controller path", () => {
  const source = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.normalize()",
  ].join("\n");

  assert.deepEqual(
    frappeDocumentHookDispatches(source, "wiki/services/wiki_page.py", [
      { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    ]),
    [],
  );
});

test("fails closed for indirect, aliased, multiple, and mismatched Document classes", () => {
  const indirect = [
    "class WikiPage(BaseWikiPage):",
    "    def validate(self):",
    "        self.normalize()",
  ].join("\n");
  assert.deepEqual(
    frappeDocumentHookDispatches(indirect, "wiki/wiki/doctype/wiki_page/wiki_page.py", [
      { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    ]),
    [],
  );

  const alias = [
    "class WikiPage(Doc):",
    "    def validate(self):",
    "        self.normalize()",
  ].join("\n");
  assert.deepEqual(
    frappeDocumentHookDispatches(alias, "wiki/wiki/doctype/wiki_page/wiki_page.py", [
      { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
    ]),
    [],
  );

  const multiple = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.normalize()",
    "",
    "class WikiPagePreview(Document):",
    "    def validate(self):",
    "        self.normalize()",
  ].join("\n");
  assert.deepEqual(
    frappeDocumentHookDispatches(multiple, "wiki/wiki/doctype/wiki_page/wiki_page.py", [
      { name: "validate", qualified_name: "WikiPage.validate", line: 2 },
      { name: "validate", qualified_name: "WikiPagePreview.validate", line: 6 },
    ]),
    [],
  );

  const mismatched = [
    "class WikiPage(Document):",
    "    def validate(self):",
    "        self.normalize()",
  ].join("\n");
  assert.deepEqual(
    frappeDocumentHookDispatches(mismatched, "wiki/wiki/doctype/wiki_page/wiki_page.py", [
      { name: "validate", qualified_name: "OtherController.validate", line: 2 },
    ]),
    [],
  );
});
