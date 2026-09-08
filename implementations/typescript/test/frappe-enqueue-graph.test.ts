import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-enqueue-"));
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

function enqueueTargets(graph: Awaited<ReturnType<typeof buildAssuranceGraph>>): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "frappe_enqueue")
    .map((edge) => byId.get(edge.to)?.qualified_name)
    .filter((name): name is string => Boolean(name));
}

test("resolves a literal Frappe enqueue method keyword instead of unrelated dotted keyword strings", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild():",
        "    frappe.enqueue(queue='reports.high', method='wiki.jobs.rebuild_index', job_name='jobs.rebuild')",
      ].join("\n"),
      "wiki/jobs.py": [
        "def rebuild_index():",
        "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Indexed')",
      ].join("\n"),
      "reports.py": [
        "def high():",
        "    print('not a job target')",
      ].join("\n"),
      "jobs.py": [
        "def rebuild():",
        "    print('also not a job target')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const targets = enqueueTargets(graph);
      assert.deepEqual(targets, ["rebuild_index"]);
      const rebuild = graph.nodes.find((node) => node.name === "rebuild_index");
      const high = graph.nodes.find((node) => node.name === "high");
      assert.ok(rebuild?.roles.includes("entrypoint"));
      assert.ok(high);
      assert.equal(high.roles.includes("entrypoint"), false);
    },
  );
});

test("preserves literal positional Frappe enqueue targets", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild():",
        "    frappe.enqueue('wiki.jobs.rebuild_index', queue='long')",
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

test("fails closed when the Frappe enqueue method target is dynamic", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(dynamic_target):",
        "    frappe.enqueue(queue='reports.high', method=dynamic_target)",
      ].join("\n"),
      "reports.py": [
        "def high():",
        "    print('not a target')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), []);
      const high = graph.nodes.find((node) => node.name === "high");
      assert.ok(high);
      assert.equal(high.roles.includes("entrypoint"), false);
    },
  );
});

test("does not treat unrelated enqueue methods as Frappe dispatch", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "def rebuild(queue):",
        "    queue.enqueue('wiki.jobs.rebuild_index')",
      ].join("\n"),
      "wiki/jobs.py": [
        "def rebuild_index():",
        "    print('rebuild')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), []);
      const target = graph.nodes.find((node) => node.name === "rebuild_index");
      assert.ok(target);
      assert.equal(target.roles.includes("entrypoint"), false);
    },
  );
});

test("fails closed for starred argument composition", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "def rebuild(args):",
        "    frappe.enqueue(*args, queue='reports.high')",
      ].join("\n"),
      "reports.py": [
        "def high():",
        "    print('not a target')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(enqueueTargets(graph), []);
    },
  );
});
