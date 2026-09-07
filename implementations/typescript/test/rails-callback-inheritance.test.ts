import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";
import { hasAuthorizationBeforeAction } from "../src/rails-callbacks.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-rails-inherited-callback-"));
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

test("resolves authorization through an unambiguous controller superclass chain", () => {
  const application = [
    "class ApplicationController < ActionController::Base",
    "  before_action :authorize_request, only: :update",
    "  def authorize_request",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  const secured = [
    "class SecuredController < ApplicationController",
    "end",
  ].join("\n");
  const invoices = [
    "class InvoicesController < SecuredController",
    "end",
  ].join("\n");

  assert.equal(hasAuthorizationBeforeAction({
    target_source: invoices,
    controller: "InvoicesController",
    action: "update",
    controller_sources: [
      { path: "app/controllers/application_controller.rb", source: application },
      { path: "app/controllers/secured_controller.rb", source: secured },
      { path: "app/controllers/invoices_controller.rb", source: invoices },
    ],
    authorization_methods: new Set(["ApplicationController#authorize_request"]),
  }), true);

  assert.equal(hasAuthorizationBeforeAction({
    target_source: invoices,
    controller: "InvoicesController",
    action: "index",
    controller_sources: [
      { path: "app/controllers/application_controller.rb", source: application },
      { path: "app/controllers/secured_controller.rb", source: secured },
      { path: "app/controllers/invoices_controller.rb", source: invoices },
    ],
    authorization_methods: new Set(["ApplicationController#authorize_request"]),
  }), false);
});

test("resolves an explicit fully-qualified namespaced superclass callback with canonical identity", () => {
  const base = [
    "class Admin::BaseController < ApplicationController",
    "  before_action :authorize_admin",
    "  def authorize_admin",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  const invoices = [
    "class Admin::InvoicesController < Admin::BaseController",
    "end",
  ].join("\n");

  assert.equal(hasAuthorizationBeforeAction({
    target_source: invoices,
    controller: "Admin::InvoicesController",
    action: "update",
    controller_sources: [
      { path: "app/controllers/admin/base_controller.rb", source: base },
      { path: "app/controllers/admin/invoices_controller.rb", source: invoices },
    ],
    authorization_methods: new Set(["Admin::BaseController#authorize_admin"]),
  }), true);
});

test("fails closed when a subclass skips callbacks", () => {
  const application = [
    "class ApplicationController < ActionController::Base",
    "  before_action :authorize_request",
    "  def authorize_request",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  const invoices = [
    "class InvoicesController < ApplicationController",
    "  skip_before_action :authorize_request, only: :index",
    "end",
  ].join("\n");

  assert.equal(hasAuthorizationBeforeAction({
    target_source: invoices,
    controller: "InvoicesController",
    action: "update",
    controller_sources: [
      { path: "app/controllers/application_controller.rb", source: application },
      { path: "app/controllers/invoices_controller.rb", source: invoices },
    ],
    authorization_methods: new Set(["ApplicationController#authorize_request"]),
  }), false);
});

test("projects inherited ApplicationController authorization onto a routed action", async () => {
  await withRepo(
    {
      "config/routes.rb": "patch '/invoices/:id', to: 'invoices#update'\n",
      "app/controllers/application_controller.rb": [
        "class ApplicationController < ActionController::Base",
        "  before_action :authorize_request",
        "  private",
        "  def authorize_request",
        "    authorize current_user",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  def update",
        "    invoice.update!(status: 'approved')",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const action = graph.nodes.find((node) => node.qualified_name === "InvoicesController#update");
      assert.ok(action);
      assert.ok(action.roles.includes("authorization"));
    },
  );
});

test("projects authorization through an explicit fully-qualified namespaced controller chain", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "namespace :admin do",
        "  resources :invoices, only: :update",
        "end",
      ].join("\n"),
      "app/controllers/admin/base_controller.rb": [
        "class Admin::BaseController < ApplicationController",
        "  before_action :authorize_admin",
        "  private",
        "  def authorize_admin",
        "    authorize current_user",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/admin/invoices_controller.rb": [
        "class Admin::InvoicesController < Admin::BaseController",
        "  def update",
        "    invoice.update!(status: 'approved')",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const action = graph.nodes.find((node) => node.qualified_name === "Admin::InvoicesController#update");
      assert.ok(action);

      const routeEdges = graph.edges.filter((edge) => edge.framework?.kind === "rails_route" && edge.to === action.id);
      const authorizationMethods = new Set(
        graph.nodes.filter((node) => node.roles.includes("authorization")).map((node) => node.qualified_name),
      );
      const baseSource = await readFile(join(root, "app/controllers/admin/base_controller.rb"), "utf8");
      const invoiceSource = await readFile(join(root, "app/controllers/admin/invoices_controller.rb"), "utf8");
      const directProjection = hasAuthorizationBeforeAction({
        target_source: invoiceSource,
        controller: "Admin::InvoicesController",
        action: "update",
        controller_sources: [
          { path: "app/controllers/admin/base_controller.rb", source: baseSource },
          { path: "app/controllers/admin/invoices_controller.rb", source: invoiceSource },
        ],
        authorization_methods: authorizationMethods,
      });

      console.log("AUDITSPEC_NAMESPACED_ROUTE_EDGES", JSON.stringify(routeEdges.map((edge) => edge.framework?.detail)));
      console.log("AUDITSPEC_NAMESPACED_AUTH_METHODS", JSON.stringify([...authorizationMethods]));
      console.log("AUDITSPEC_NAMESPACED_DIRECT_PROJECTION", directProjection);

      assert.ok(routeEdges.length > 0);
      assert.equal(directProjection, true);
      assert.ok(action.roles.includes("authorization"));
    },
  );
});

test("fails closed for lexical-module namespaced inheritance", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "namespace :admin do",
        "  resources :invoices, only: :update",
        "end",
      ].join("\n"),
      "app/controllers/admin/base_controller.rb": [
        "class Admin::BaseController < ApplicationController",
        "  before_action :authorize_admin",
        "  private",
        "  def authorize_admin",
        "    authorize current_user",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/admin/invoices_controller.rb": [
        "module Admin",
        "  class InvoicesController < Admin::BaseController",
        "    def update",
        "      invoice.update!(status: 'approved')",
        "    end",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const action = graph.nodes.find((node) => node.qualified_name === "Admin::InvoicesController#update");
      assert.ok(action);
      assert.equal(action.roles.includes("authorization"), false);
    },
  );
});
