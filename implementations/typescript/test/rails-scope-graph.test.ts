import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-rails-scope-graph-"));
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

test("builds contextual explicit and resource routes through literal scopes", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  scope '/v1', module: :api do",
        "    get 'health', to: 'health#show'",
        "    resources :invoices, only: :show",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/api/health_controller.rb": [
        "class Api::HealthController < ApplicationController",
        "  def show",
        "    HealthCheck.current",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/api/invoices_controller.rb": [
        "class Api::InvoicesController < ApplicationController",
        "  def show",
        "    Invoice.find(params[:id])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const health = graph.nodes.find((node) => node.qualified_name === "Api::HealthController#show");
      const invoice = graph.nodes.find((node) => node.qualified_name === "Api::InvoicesController#show");
      assert.ok(health);
      assert.ok(invoice);

      const healthSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET /v1/health -> api/health#show",
      );
      const invoiceSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET /v1/invoices/:id -> api/invoices#show",
      );
      assert.ok(healthSurface);
      assert.ok(invoiceSurface);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === healthSurface.id && edge.to === health.id));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === invoiceSurface.id && edge.to === invoice.id));

      assert.equal(
        graph.nodes.some((node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET health -> health#show"),
        false,
      );
      assert.equal(
        graph.nodes.some((node) => node.surface?.kind === "rails_route" && node.surface.detail === "GET /health -> health#show"),
        false,
      );
    },
  );
});

test("records static constraints in canonical Rails route surface detail", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "Rails.application.routes.draw do",
        "  constraints subdomain: 'api', format: :json do",
        "    scope module: :api do",
        "      resources :invoices, only: :show",
        "    end",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/api/invoices_controller.rb": [
        "class Api::InvoicesController < ApplicationController",
        "  def show",
        "    Invoice.find(params[:id])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const target = graph.nodes.find((node) => node.qualified_name === "Api::InvoicesController#show");
      assert.ok(target);

      const surface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_route"
          && node.surface.detail === 'GET /invoices/:id -> api/invoices#show [constraints: subdomain: "api", format: :json]',
      );
      assert.ok(surface);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === surface.id && edge.to === target.id));
      assert.equal(target.roles.includes("authorization"), false);
    },
  );
});
