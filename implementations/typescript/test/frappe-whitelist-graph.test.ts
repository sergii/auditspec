import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-frappe-whitelist-"));
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

test("marks only the directly decorated Frappe function as an entrypoint", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "",
        "@frappe.whitelist()",
        "def public_ping():",
        "    frappe.logger().info('ping')",
        "",
        "def internal_update(name):",
        "    frappe.db.set_value('Project', name, 'status', 'Active')",
        "",
        "@frappe.whitelist(allow_guest=True)",
        "def public_update(name):",
        "    frappe.db.set_value('Project', name, 'status', 'Public')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const internalUpdate = graph.nodes.find((node) => node.qualified_name === "internal_update");
      const publicUpdate = graph.nodes.find((node) => node.qualified_name === "public_update");
      assert.ok(internalUpdate);
      assert.ok(publicUpdate);
      assert.equal(internalUpdate.roles.includes("entrypoint"), false);
      assert.equal(publicUpdate.roles.includes("entrypoint"), true);
      assert.equal(internalUpdate.roles.includes("mutation"), true);
      assert.equal(publicUpdate.roles.includes("mutation"), true);
    },
  );
});

test("marks multiline frappe.whitelist decorator arguments on the exact function", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "",
        "@frappe.whitelist(",
        "    allow_guest=True,",
        "    methods=['POST'],",
        ")",
        "def public_update(name):",
        "    frappe.db.set_value('Project', name, 'status', 'Public')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const publicUpdate = graph.nodes.find((node) => node.qualified_name === "public_update");
      assert.ok(publicUpdate);
      assert.equal(publicUpdate.roles.includes("entrypoint"), true);
      assert.equal(publicUpdate.roles.includes("mutation"), true);
    },
  );
});

test("marks a proven imported whitelist alias as a Frappe entrypoint", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "from frappe import whitelist as api",
        "",
        "@api(allow_guest=True)",
        "def public_update(name):",
        "    frappe.db.set_value('Project', name, 'status', 'Public')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const publicUpdate = graph.nodes.find((node) => node.qualified_name === "public_update");
      assert.ok(publicUpdate);
      assert.equal(publicUpdate.roles.includes("entrypoint"), true);
      assert.equal(publicUpdate.roles.includes("mutation"), true);
    },
  );
});

test("marks a proven frappe module alias as a Frappe entrypoint", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "import frappe as f",
        "",
        "@f.whitelist()",
        "def public_update(name):",
        "    frappe.db.set_value('Project', name, 'status', 'Public')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const publicUpdate = graph.nodes.find((node) => node.qualified_name === "public_update");
      assert.ok(publicUpdate);
      assert.equal(publicUpdate.roles.includes("entrypoint"), true);
      assert.equal(publicUpdate.roles.includes("mutation"), true);
    },
  );
});

test("does not strengthen a mutation when the whitelist alias is rebound", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "from frappe import whitelist as api",
        "api = custom_decorator",
        "",
        "@api()",
        "def internal_update(name):",
        "    frappe.db.set_value('Project', name, 'status', 'Internal')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const internalUpdate = graph.nodes.find((node) => node.qualified_name === "internal_update");
      assert.ok(internalUpdate);
      assert.equal(internalUpdate.roles.includes("entrypoint"), false);
      assert.equal(internalUpdate.roles.includes("mutation"), true);
    },
  );
});
