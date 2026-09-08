import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-queue-action-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("models self.queue_action as a separate background framework surface", async () => {
  await withRepo(
    {
      "wiki/wiki/doctype/wiki_page/wiki_page.py": [
        "import frappe",
        "from frappe.model.document import Document",
        "",
        "class WikiPage(Document):",
        "    def on_update(self):",
        "        self.queue_action('rebuild_index', queue='long')",
        "",
        "    def rebuild_index(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Indexed')",
        "        auditspec.emit(action='wiki.rebuild_index')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const surface = graph.nodes.find(
        (node) => node.kind === "surface" && node.surface?.kind === "frappe_queue_action",
      );
      const target = graph.nodes.find((node) => node.qualified_name === "WikiPage.rebuild_index");
      assert.ok(surface);
      assert.ok(target);
      assert.ok(graph.edges.some(
        (edge) => edge.kind === "framework_dispatch"
          && edge.framework?.kind === "frappe_queue_action"
          && edge.from === surface.id
          && edge.to === target.id,
      ));

      const path = findAssurancePath(graph, {
        path: "wiki/wiki/doctype/wiki_page/wiki_page.py",
        line: 9,
        column: 9,
      });
      assert.ok(path);
      assert.equal(path.qualified_names[0], surface.qualified_name);
      assert.ok(path.roles.includes("entrypoint"));
      assert.ok(path.roles.includes("mutation"));
      assert.ok(path.roles.includes("audit"));
    },
  );
});

test("does not model external doc.queue_action when document identity is unknown", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "def enqueue(doc):",
        "    doc.queue_action('rebuild_index')",
      ].join("\n"),
      "wiki/wiki/doctype/wiki_page/wiki_page.py": [
        "from frappe.model.document import Document",
        "class WikiPage(Document):",
        "    def rebuild_index(self):",
        "        self.db_set('status', 'Indexed')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.equal(
        graph.nodes.filter((node) => node.kind === "surface" && node.surface?.kind === "frappe_queue_action").length,
        0,
      );
    },
  );
});
