import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-rails-resource-graph-"));
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

test("links namespaced and nested resource routes to controller actions", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  namespace :admin do",
        "    resources :users, only: :show",
        "  end",
        "  resources :accounts, only: :show do",
        "    resources :invoices, only: :show",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/admin/users_controller.rb": [
        "class Admin::UsersController < ApplicationController",
        "  def show",
        "    User.find(params[:id])",
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
      "app/controllers/accounts_controller.rb": [
        "class AccountsController < ApplicationController",
        "  def show",
        "    Account.find(params[:id])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const adminTarget = graph.nodes.find((node) => node.qualified_name === "Admin::UsersController#show");
      const invoiceTarget = graph.nodes.find((node) => node.qualified_name === "InvoicesController#show");
      assert.ok(adminTarget);
      assert.ok(invoiceTarget);

      const adminSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET /admin/users/:id -> admin/users#show",
      );
      const nestedSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET /accounts/:account_id/invoices/:id -> invoices#show",
      );
      assert.ok(adminSurface);
      assert.ok(nestedSurface);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === adminSurface.id && edge.to === adminTarget.id));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === nestedSurface.id && edge.to === invoiceTarget.id));
      assert.equal(
        graph.nodes.some((node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET /users/:id -> users#show"),
        false,
      );
    },
  );
});
