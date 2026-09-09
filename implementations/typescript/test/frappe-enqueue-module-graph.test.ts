import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-enqueue-module-"));
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

function enqueueTargets(graph: Awaited<ReturnType<typeof buildAssuranceGraph>>): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "frappe_enqueue")
    .map((edge) => byId.get(edge.to)?.qualified_name)
    .filter((name): name is string => Boolean(name));
}

test("resolves a direct module-level imported Frappe enqueue function reference", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "from wiki.jobs import rebuild_index",
        "",
        "def schedule_rebuild():",
        "    frappe.enqueue(rebuild_index, queue='long')",
      ].join("\n"),
      "wiki/jobs.py": [
        "import frappe",
        "def rebuild_index():",
        "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Indexed')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), ["rebuild_index"]);
      const target = graph.nodes.find(
        (node) => node.location.path === "wiki/jobs.py" && node.qualified_name === "rebuild_index",
      );
      assert.ok(target?.roles.includes("entrypoint"));
      assert.ok(target?.roles.includes("mutation"));
    },
  );
});

test("resolves a module-level imported alias passed through method=", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "from wiki.jobs import rebuild_index as job",
        "",
        "def schedule_rebuild():",
        "    frappe.enqueue(method=job, queue='long')",
      ].join("\n"),
      "wiki/jobs.py": [
        "def rebuild_index():",
        "    print('rebuild')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), ["rebuild_index"]);
    },
  );
});

test("does not fall back to a same-name local function when a module import target is missing", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "from external.jobs import rebuild_index",
        "",
        "def schedule_rebuild():",
        "    frappe.enqueue(rebuild_index)",
        "",
        "def rebuild_index():",
        "    print('must not become the imported target')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), []);
      const local = graph.nodes.find(
        (node) => node.location.path === "wiki/api.py" && node.qualified_name === "rebuild_index",
      );
      assert.ok(local);
      assert.equal(local.roles.includes("entrypoint"), false);
    },
  );
});

test("fails closed when a module import is rebound or shadowed by the caller", async () => {
  await withRepo(
    {
      "wiki/rebound.py": [
        "import frappe",
        "from wiki.jobs import rebuild_index",
        "rebuild_index = choose_job()",
        "",
        "def schedule_rebuild():",
        "    frappe.enqueue(rebuild_index)",
      ].join("\n"),
      "wiki/shadowed.py": [
        "import frappe",
        "from wiki.jobs import rebuild_index",
        "",
        "def schedule_rebuild(rebuild_index):",
        "    frappe.enqueue(rebuild_index)",
      ].join("\n"),
      "wiki/jobs.py": [
        "def rebuild_index():",
        "    print('rebuild')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), []);
      const target = graph.nodes.find(
        (node) => node.location.path === "wiki/jobs.py" && node.qualified_name === "rebuild_index",
      );
      assert.ok(target);
      assert.equal(target.roles.includes("entrypoint"), false);
    },
  );
});
