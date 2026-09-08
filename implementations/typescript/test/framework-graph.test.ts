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

test("expands top-level Rails resources into RESTful route surfaces", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  resources :invoices",
        "end",
      ].join("\n"),
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  def index",
        "    Invoice.all",
        "  end",
        "  def create",
        "    Invoice.create!",
        "  end",
        "  def new",
        "    Invoice.new",
        "  end",
        "  def show",
        "    Invoice.find(params[:id])",
        "  end",
        "  def edit",
        "    Invoice.find(params[:id])",
        "  end",
        "  def update",
        "    Invoice.find(params[:id]).update!(invoice_params)",
        "  end",
        "  def destroy",
        "    Invoice.find(params[:id]).destroy!",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const details = graph.nodes
        .filter((node) => node.kind === "surface" && node.surface?.kind === "rails_route")
        .map((node) => node.surface!.detail);

      assert.ok(details.includes("GET /invoices -> invoices#index"));
      assert.ok(details.includes("POST /invoices -> invoices#create"));
      assert.ok(details.includes("GET /invoices/new -> invoices#new"));
      assert.ok(details.includes("GET /invoices/:id -> invoices#show"));
      assert.ok(details.includes("GET /invoices/:id/edit -> invoices#edit"));
      assert.ok(details.includes("PATCH /invoices/:id -> invoices#update"));
      assert.ok(details.includes("PUT /invoices/:id -> invoices#update"));
      assert.ok(details.includes("DELETE /invoices/:id -> invoices#destroy"));

      const update = graph.nodes.find((node) => node.qualified_name === "InvoicesController#update");
      assert.ok(update);
      assert.equal(
        graph.edges.filter((edge) => edge.kind === "framework_dispatch" && edge.to === update.id && edge.framework?.kind === "rails_route").length,
        2,
      );
    },
  );
});

test("honors Rails resources only and except filters", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  resources :invoices, only: [:show, :update]",
        "  resources :receipts, except: %i[destroy edit]",
        "end",
      ].join("\n"),
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  def show",
        "    Invoice.find(params[:id])",
        "  end",
        "  def update",
        "    Invoice.find(params[:id]).update!(invoice_params)",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/receipts_controller.rb": [
        "class ReceiptsController < ApplicationController",
        "  def show",
        "    Receipt.find(params[:id])",
        "  end",
        "  def edit",
        "    Receipt.find(params[:id])",
        "  end",
        "  def destroy",
        "    Receipt.find(params[:id]).destroy!",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const details = graph.nodes
        .filter((node) => node.kind === "surface" && node.surface?.kind === "rails_route")
        .map((node) => node.surface!.detail);

      assert.ok(details.includes("GET /invoices/:id -> invoices#show"));
      assert.ok(details.includes("PATCH /invoices/:id -> invoices#update"));
      assert.ok(details.includes("PUT /invoices/:id -> invoices#update"));
      assert.ok(!details.some((detail) => detail.includes("invoices#index")));
      assert.ok(!details.some((detail) => detail.includes("receipts#destroy")));
      assert.ok(!details.some((detail) => detail.includes("receipts#edit")));
    },
  );
});

test("expands a simple singular Rails resource with its plural controller", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  resource :profile, only: [:show, :update]",
        "end",
      ].join("\n"),
      "app/controllers/profiles_controller.rb": [
        "class ProfilesController < ApplicationController",
        "  def show",
        "    Profile.current",
        "  end",
        "  def update",
        "    Profile.current.update!(profile_params)",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const details = graph.nodes
        .filter((node) => node.kind === "surface" && node.surface?.kind === "rails_route")
        .map((node) => node.surface!.detail);

      assert.ok(details.includes("GET /profile -> profiles#show"));
      assert.ok(details.includes("PATCH /profile -> profiles#update"));
      assert.ok(details.includes("PUT /profile -> profiles#update"));
    },
  );
});

test("does not invent root resource routes inside unsupported Rails namespaces", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  namespace :admin do",
        "    resources :invoices, only: [:show]",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  def show",
        "    Invoice.find(params[:id])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const details = graph.nodes
        .filter((node) => node.kind === "surface" && node.surface?.kind === "rails_route")
        .map((node) => node.surface!.detail);
      assert.ok(!details.some((detail) => detail.includes("invoices#show")));
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

test("links Sidekiq perform_async to the worker perform entrypoint", async () => {
  await withRepo(
    {
      "app/services/reindex_service.rb": [
        "class ReindexService",
        "  def call",
        "    ReindexWorker.perform_async(42)",
        "  end",
        "end",
      ].join("\n"),
      "app/workers/reindex_worker.rb": [
        "class ReindexWorker",
        "  include Sidekiq::Job",
        "  def perform(id)",
        "    record = SearchIndex.find(id)",
        "    record.update!(status: 'ready')",
        "    AuditSpec.emit!(action: 'index.complete')",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const perform = graph.nodes.find((node) => node.qualified_name === "ReindexWorker#perform");
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

test("links Frappe scheduler_events to a scheduled handler", async () => {
  await withRepo(
    {
      "wiki/hooks.py": [
        "app_name = 'wiki'",
        "scheduler_events = {",
        "  'hourly': ['wiki.jobs.refresh_index']",
        "}",
      ].join("\n"),
      "wiki/jobs.py": [
        "import frappe",
        "def refresh_index():",
        "    frappe.db.set_value('Wiki Page', 'Home', 'status', 'Fresh')",
        "    auditspec.emit(action='wiki.refresh_index')",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const surface = graph.nodes.find((node) => node.kind === "surface" && node.surface?.kind === "frappe_scheduler");
      const handler = graph.nodes.find((node) => node.name === "refresh_index");
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
