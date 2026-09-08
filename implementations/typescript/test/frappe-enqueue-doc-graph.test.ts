import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-enqueue-doc-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const absolute = join(root, path);
      await mkdir(join(absolute, ".."), { recursive: true });
      await writeFile(absolute, content);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function enqueueDocEdges(graph: Awaited<ReturnType<typeof buildAssuranceGraph>>) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "frappe_enqueue_doc")
    .map((edge) => ({
      detail: edge.framework!.detail,
      from: byId.get(edge.from),
      to: byId.get(edge.to),
    }));
}

const controller = [
  "import frappe",
  "from frappe.model.document import Document",
  "",
  "class WikiPage(Document):",
  "    def rebuild_index(self):",
  "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Indexed')",
].join("\n");

test("links positional frappe.enqueue_doc to a conventional Document controller method", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(docname):",
        "    frappe.enqueue_doc('Wiki Page', docname, 'rebuild_index', queue='long')",
      ].join("\n"),
      "wiki/wiki/doctype/wiki_page/wiki_page.py": controller,
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const edges = enqueueDocEdges(graph);
      assert.equal(edges.length, 1);
      assert.equal(edges[0]!.to?.qualified_name, "WikiPage.rebuild_index");
      assert.equal(
        edges[0]!.detail,
        "frappe.enqueue_doc Wiki Page#rebuild_index -> WikiPage.rebuild_index",
      );
      assert.ok(edges[0]!.to?.roles.includes("entrypoint"));
    },
  );
});

test("supports keyword frappe.enqueue_doc arguments while allowing a dynamic document name", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(docname):",
        "    frappe.enqueue_doc(doctype='Wiki Page', name=docname, method='rebuild_index', queue='long')",
      ].join("\n"),
      "wiki/wiki/doctype/wiki_page/wiki_page.py": controller,
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueDocEdges(graph).map((edge) => edge.to?.qualified_name), ["WikiPage.rebuild_index"]);
    },
  );
});

test("fails closed when doctype or method identity is dynamic", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(docname, doctype, method):",
        "    frappe.enqueue_doc(doctype, docname, 'rebuild_index')",
        "    frappe.enqueue_doc('Wiki Page', docname, method)",
      ].join("\n"),
      "wiki/wiki/doctype/wiki_page/wiki_page.py": controller,
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueDocEdges(graph), []);
      const target = graph.nodes.find((node) => node.qualified_name === "WikiPage.rebuild_index");
      assert.equal(target?.roles.includes("entrypoint"), false);
    },
  );
});

test("fails closed when the same conventional DocType controller target is ambiguous across apps", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(docname):",
        "    frappe.enqueue_doc('Wiki Page', docname, 'rebuild_index')",
      ].join("\n"),
      "app_one/app_one/doctype/wiki_page/wiki_page.py": controller,
      "app_two/app_two/doctype/wiki_page/wiki_page.py": controller.replace("class WikiPage", "class WikiPageOverride"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueDocEdges(graph), []);
    },
  );
});

test("fails closed for indirect Document controller inheritance", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(docname):",
        "    frappe.enqueue_doc('Wiki Page', docname, 'rebuild_index')",
      ].join("\n"),
      "wiki/wiki/doctype/wiki_page/wiki_page.py": [
        "import frappe",
        "class WikiPage(BaseWikiPage):",
        "    def rebuild_index(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Indexed')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueDocEdges(graph), []);
    },
  );
});
