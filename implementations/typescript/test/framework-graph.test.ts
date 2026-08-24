import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-framework-graph-"));
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

test("links an explicit Rails route to its controller action", async () => {
  await withRepo(
    {
      "config/routes.rb": "post '/invoices/:id/approve', to: 'invoices#approve'\n",
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  def approve",
        "    ApproveInvoice.call(invoice)",
        "  end",
        "end",
      ].join("\n"),
      "app/services/approve_invoice.rb": [
        "class ApproveInvoice",
        "  def self.call(invoice)",
        "    ApplicationRecord.transaction do",
        "      invoice.update!(status: 'approved')",
        "      AuditSpec.emit!(action: 'invoice.approve')",
        "    end",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const route = graph.nodes.find((node) => node.kind === "surface" && node.surface?.kind === "rails_route");
      const controller = graph.nodes.find((node) => node.qualified_name === "InvoicesController#approve");
      assert.ok(route);
      assert.ok(controller);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === route.id && edge.to === controller.id));

      const path = findAssurancePath(graph, { path: "app/services/approve_invoice.rb", line: 4, column: 7 });
      assert.ok(path);
      assert.equal(path.qualified_names[0], route.qualified_name);
      assert.ok(path.roles.includes("audit"));
      assert.ok(path.roles.includes("transaction"));
    },
  );
});

test("links ActiveJob perform_later to the perform entrypoint", async () => {
  await withRepo(
    {
      "app/services/export_service.rb": [
        "class ExportService",
        "  def call",
        "    ExportJob.perform_later(42)",
        "  end",
        "end",
      ].join("\n"),
      "app/jobs/export_job.rb": [
        "class ExportJob < ApplicationJob",
        "  def perform(id)",
        "    record = Export.find(id)",
        "    record.update!(status: 'done')",
        "    AuditSpec.emit!(action: 'export.complete')",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const perform = graph.nodes.find((node) => node.qualified_name === "ExportJob#perform");
      assert.ok(perform);
      assert.ok(perform.roles.includes("entrypoint"));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "rails_job_dispatch" && edge.to === perform.id));
    },
  );
});

test("links Frappe hooks.py doc_events to a handler", async () => {
  await withRepo(
    {
      "wiki/hooks.py": [
        "app_name = 'wiki'",
        "doc_events = {",
        "  'Wiki Page': {",
        "    'on_update': 'wiki.handlers.audit_wiki_update'",
        "  }",
        "}",
      ].join("\n"),
      "wiki/handlers.py": [
        "import frappe",
        "def audit_wiki_update(doc, method=None):",
        "    doc.db_set('status', 'Reviewed')",
        "    auditspec.emit(action='wiki.update')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const surface = graph.nodes.find((node) => node.kind === "surface" && node.surface?.kind === "frappe_doc_event");
      const handler = graph.nodes.find((node) => node.name === "audit_wiki_update");
      assert.ok(surface);
      assert.ok(handler);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === surface.id && edge.to === handler.id));
    },
  );
});

test("links frappe.enqueue dotted target to a background function", async () => {
  await withRepo(
    {
      "wiki/api.py": [
        "import frappe",
        "@frappe.whitelist()",
        "def rebuild():",
        "    frappe.enqueue('wiki.jobs.rebuild_index')",
      ].join("\n"),
      "wiki/jobs.py": [
        "import frappe",
        "def rebuild_index():",
        "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Indexed')",
        "    auditspec.emit(action='wiki.rebuild_index')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const target = graph.nodes.find((node) => node.name === "rebuild_index");
      assert.ok(target);
      assert.ok(target.roles.includes("entrypoint"));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "frappe_enqueue" && edge.to === target.id));
    },
  );
});
