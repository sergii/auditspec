import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-document-hooks-"));
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

function documentHookEdges(graph: Awaited<ReturnType<typeof buildAssuranceGraph>>) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "frappe_document_hook")
    .map((edge) => ({
      detail: edge.framework!.detail,
      from: byId.get(edge.from),
      to: byId.get(edge.to),
    }));
}

test("builds Frappe Document lifecycle surfaces to concrete controller methods", async () => {
  await withRepo(
    {
      "wiki/wiki/doctype/wiki_page/wiki_page.py": [
        "import frappe",
        "from frappe.model.document import Document",
        "",
        "class WikiPage(Document):",
        "    def validate(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Validated')",
        "",
        "    def on_submit(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Submitted')",
        "",
        "    def helper(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Helper')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const edges = documentHookEdges(graph);

      assert.deepEqual(
        edges.map(({ detail, from, to }) => ({
          detail,
          surface_kind: from?.surface?.kind,
          target: to?.qualified_name,
        })),
        [
          {
            detail: "DOCUMENT_HOOK validate -> WikiPage.validate",
            surface_kind: "frappe_document_hook",
            target: "WikiPage.validate",
          },
          {
            detail: "DOCUMENT_HOOK on_submit -> WikiPage.on_submit",
            surface_kind: "frappe_document_hook",
            target: "WikiPage.on_submit",
          },
        ],
      );

      assert.equal(
        graph.nodes.some((node) => node.surface?.kind === "frappe_document_hook" && node.surface.detail.includes("helper")),
        false,
      );
    },
  );
});

test("a mutation inside a Document hook is statically reachable through the lifecycle surface", async () => {
  await withRepo(
    {
      "wiki/wiki/doctype/wiki_page/wiki_page.py": [
        "import frappe",
        "from frappe.model.document import Document",
        "",
        "class WikiPage(Document):",
        "    def on_update(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Updated')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const path = findAssurancePath(graph, {
        path: "wiki/wiki/doctype/wiki_page/wiki_page.py",
        line: 6,
        column: 9,
      });

      assert.ok(path);
      assert.equal(path.qualified_names[0], "frappe.frappe_document_hook:DOCUMENT_HOOK on_update -> WikiPage.on_update");
      assert.equal(path.qualified_names.at(-1), "WikiPage.on_update");
      assert.ok(path.roles.includes("entrypoint"));
      assert.ok(path.roles.includes("mutation"));
    },
  );
});

test("does not create Document lifecycle surfaces outside the conservative controller subset", async () => {
  await withRepo(
    {
      "wiki/services/wiki_page.py": [
        "import frappe",
        "from frappe.model.document import Document",
        "",
        "class WikiPage(Document):",
        "    def validate(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Validated')",
      ].join("\n"),
      "wiki/wiki/doctype/wiki_page/wiki_page.py": [
        "import frappe",
        "from frappe.model.document import Document",
        "",
        "class WikiPage(Document):",
        "    def db_update(self):",
        "        frappe.db.set_value('Wiki Page', self.name, 'status', 'Stored')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(documentHookEdges(graph), []);
    },
  );
});
