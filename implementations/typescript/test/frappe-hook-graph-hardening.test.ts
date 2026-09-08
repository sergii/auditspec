import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-hook-graph-"));
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

function hookTargets(graph: Awaited<ReturnType<typeof buildAssuranceGraph>>, kind: string): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === kind)
    .map((edge) => byId.get(edge.to)?.qualified_name)
    .filter((name): name is string => Boolean(name));
}

const handlers = [
  "import frappe",
  "def audit_wiki_update(doc=None, method=None):",
  "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Reviewed')",
  "def misleading_key_target():",
  "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Wrong')",
].join("\n");

const jobs = [
  "import frappe",
  "def refresh_index():",
  "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Fresh')",
  "def misleading_cron_target():",
  "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Wrong')",
].join("\n");

test("keeps documented static doc_events and scheduler_events graph dispatch", async () => {
  await withRepo(
    {
      "wiki/hooks.py": [
        "app_name = 'wiki'",
        "doc_events = {",
        "    'Wiki Page': {",
        "        'on_update': 'wiki.handlers.audit_wiki_update',",
        "    },",
        "}",
        "scheduler_events = {",
        "    'hourly': ['wiki.jobs.refresh_index'],",
        "}",
      ].join("\n"),
      "wiki/handlers.py": handlers,
      "wiki/jobs.py": jobs,
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(hookTargets(graph, "frappe_doc_event"), ["audit_wiki_update"]);
      assert.deepEqual(hookTargets(graph, "frappe_scheduler"), ["refresh_index"]);
    },
  );
});

test("dotted hook keys cannot become framework dispatch targets", async () => {
  await withRepo(
    {
      "wiki/hooks.py": [
        "app_name = 'wiki'",
        "doc_events = {",
        "    'wiki.handlers.misleading_key_target': {",
        "        'on_update': 'wiki.handlers.audit_wiki_update',",
        "    },",
        "}",
        "scheduler_events = {",
        "    'cron': {",
        "        'wiki.jobs.misleading_cron_target': ['wiki.jobs.refresh_index'],",
        "    },",
        "}",
      ].join("\n"),
      "wiki/handlers.py": handlers,
      "wiki/jobs.py": jobs,
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(hookTargets(graph, "frappe_doc_event"), ["audit_wiki_update"]);
      assert.deepEqual(hookTargets(graph, "frappe_scheduler"), ["refresh_index"]);

      const wrongTargets = graph.edges
        .filter((edge) => ["frappe_doc_event", "frappe_scheduler"].includes(edge.framework?.kind ?? ""))
        .map((edge) => graph.nodes.find((node) => node.id === edge.to)?.name);
      assert.ok(!wrongTargets.includes("misleading_key_target"));
      assert.ok(!wrongTargets.includes("misleading_cron_target"));
    },
  );
});

test("dynamic or mutated hook composition creates no optimistic graph surfaces", async () => {
  await withRepo(
    {
      "wiki/hooks.py": [
        "app_name = 'wiki'",
        "doc_events = {",
        "    **shared_doc_events,",
        "    'Wiki Page': {'on_update': 'wiki.handlers.audit_wiki_update'},",
        "}",
        "scheduler_events = {'hourly': ['wiki.jobs.refresh_index']}",
        "scheduler_events.update(extra_scheduler_events)",
      ].join("\n"),
      "wiki/handlers.py": handlers,
      "wiki/jobs.py": jobs,
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      assert.deepEqual(hookTargets(graph, "frappe_doc_event"), []);
      assert.deepEqual(hookTargets(graph, "frappe_scheduler"), []);
      assert.equal(graph.nodes.some((node) => node.surface?.kind === "frappe_doc_event"), false);
      assert.equal(graph.nodes.some((node) => node.surface?.kind === "frappe_scheduler"), false);
    },
  );
});
