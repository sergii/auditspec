import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";
import { concernBeforeActionCallbacks, hasAuthorizationBeforeAction } from "../src/rails-callbacks.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-rails-concern-callback-"));
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

const authorizationConcern = [
  "module AuthorizationConcern",
  "  extend ActiveSupport::Concern",
  "",
  "  included do",
  "    before_action :authorize_request, only: :update",
  "  end",
  "",
  "  private",
  "  def authorize_request",
  "    authorize current_user",
  "  end",
  "end",
].join("\n");

const adminAuthorizationConcern = authorizationConcern.replace(
  "module AuthorizationConcern",
  "module Admin::AuthorizationConcern",
);

test("resolves literal before_action declarations from a canonical ActiveSupport::Concern included block", () => {
  assert.deepEqual(
    concernBeforeActionCallbacks(authorizationConcern, "AuthorizationConcern", "update").map((callback) => callback.method),
    ["authorize_request"],
  );
  assert.deepEqual(concernBeforeActionCallbacks(authorizationConcern, "AuthorizationConcern", "index"), []);
});

test("fails closed for conditional concern callbacks and non-Concern modules", () => {
  const conditional = [
    "module AuthorizationConcern",
    "  extend ActiveSupport::Concern",
    "  included do",
    "    before_action :authorize_request, if: :authorization_required?",
    "  end",
    "  def authorize_request",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  const plainModule = conditional.replace("  extend ActiveSupport::Concern\n", "").replace(", if: :authorization_required?", "");

  assert.deepEqual(concernBeforeActionCallbacks(conditional, "AuthorizationConcern", "update"), []);
  assert.deepEqual(concernBeforeActionCallbacks(plainModule, "AuthorizationConcern", "update"), []);
});

test("resolves authorization from a literal concern included by a controller", () => {
  const controller = [
    "class InvoicesController < ApplicationController",
    "  include AuthorizationConcern",
    "end",
  ].join("\n");

  assert.equal(hasAuthorizationBeforeAction({
    target_source: controller,
    controller: "InvoicesController",
    action: "update",
    controller_sources: [
      { path: "app/controllers/concerns/authorization_concern.rb", source: authorizationConcern },
      { path: "app/controllers/invoices_controller.rb", source: controller },
    ],
    authorization_methods: new Set(["AuthorizationConcern#authorize_request"]),
  }), true);
});

test("projects concern authorization onto a routed controller action", async () => {
  await withRepo(
    {
      "config/routes.rb": "patch '/invoices/:id', to: 'invoices#update'\n",
      "app/controllers/concerns/authorization_concern.rb": authorizationConcern,
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  include AuthorizationConcern",
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

test("projects a concern included by ApplicationController through the superclass chain", async () => {
  await withRepo(
    {
      "config/routes.rb": "patch '/invoices/:id', to: 'invoices#update'\n",
      "app/controllers/concerns/authorization_concern.rb": authorizationConcern,
      "app/controllers/application_controller.rb": [
        "class ApplicationController < ActionController::Base",
        "  include AuthorizationConcern",
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

test("does not claim concern authorization when the subclass skips callbacks", async () => {
  await withRepo(
    {
      "config/routes.rb": "patch '/invoices/:id', to: 'invoices#update'\n",
      "app/controllers/concerns/authorization_concern.rb": authorizationConcern,
      "app/controllers/application_controller.rb": [
        "class ApplicationController < ActionController::Base",
        "  include AuthorizationConcern",
        "end",
      ].join("\n"),
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  skip_before_action :authorize_request, only: :index",
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
      assert.equal(action.roles.includes("authorization"), false);
    },
  );
});

test("resolves an explicit namespaced concern included by a namespaced controller", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "namespace :admin do",
        "  resources :invoices, only: :update",
        "end",
      ].join("\n"),
      "app/controllers/concerns/admin/authorization_concern.rb": adminAuthorizationConcern,
      "app/controllers/admin/invoices_controller.rb": [
        "class Admin::InvoicesController < ApplicationController",
        "  include Admin::AuthorizationConcern",
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
      assert.ok(action.roles.includes("authorization"));
    },
  );
});

test("fails closed for lexical-module concern declarations and dynamic inclusion", () => {
  const controller = [
    "class InvoicesController < ApplicationController",
    "  include Admin::AuthorizationConcern",
    "  include concern_module",
    "end",
  ].join("\n");
  const lexicalConcern = [
    "module Admin",
    "  module AuthorizationConcern",
    "    extend ActiveSupport::Concern",
    "    included do",
    "      before_action :authorize_request",
    "    end",
    "    def authorize_request",
    "      authorize current_user",
    "    end",
    "  end",
    "end",
  ].join("\n");

  assert.equal(hasAuthorizationBeforeAction({
    target_source: controller,
    controller: "InvoicesController",
    action: "update",
    controller_sources: [
      { path: "app/controllers/concerns/admin/authorization_concern.rb", source: lexicalConcern },
      { path: "app/controllers/invoices_controller.rb", source: controller },
    ],
    authorization_methods: new Set(["Admin::AuthorizationConcern#authorize_request"]),
  }), false);
});
