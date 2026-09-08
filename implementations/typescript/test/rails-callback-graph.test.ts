import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-rails-callback-"));
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

test("projects unconditional before_action authorization onto a routed controller action", async () => {
  await withRepo(
    {
      "config/routes.rb": "patch '/invoices/:id', to: 'invoices#update'\n",
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  before_action :authorize_invoice, only: :update",
        "  def update",
        "    ApproveInvoice.call(invoice)",
        "  end",
        "  private",
        "  def authorize_invoice",
        "    authorize invoice",
        "  end",
        "end",
      ].join("\n"),
      "app/services/approve_invoice.rb": [
        "class ApproveInvoice",
        "  def self.call(invoice)",
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

      const path = findAssurancePath(graph, { path: "app/services/approve_invoice.rb", line: 3, column: 5 });
      assert.ok(path);
      assert.ok(path.roles.includes("authorization"));
      assert.ok(path.qualified_names.some((name) => name.includes("rails.rails_route:PATCH /invoices/:id")));
    },
  );
});

test("does not project conditional before_action authorization", async () => {
  await withRepo(
    {
      "config/routes.rb": "patch '/invoices/:id', to: 'invoices#update'\n",
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  before_action :authorize_invoice, if: :authorization_required?",
        "  def update",
        "    invoice.update!(status: 'approved')",
        "  end",
        "  private",
        "  def authorize_invoice",
        "    authorize invoice",
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

test("does not project before_action authorization onto actions excluded by only", async () => {
  await withRepo(
    {
      "config/routes.rb": [
        "patch '/invoices/:id', to: 'invoices#update'",
        "delete '/invoices/:id', to: 'invoices#destroy'",
      ].join("\n"),
      "app/controllers/invoices_controller.rb": [
        "class InvoicesController < ApplicationController",
        "  before_action :authorize_invoice, only: :update",
        "  def update",
        "    invoice.update!(status: 'approved')",
        "  end",
        "  def destroy",
        "    invoice.destroy!",
        "  end",
        "  private",
        "  def authorize_invoice",
        "    authorize invoice",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const update = graph.nodes.find((node) => node.qualified_name === "InvoicesController#update");
      const destroy = graph.nodes.find((node) => node.qualified_name === "InvoicesController#destroy");
      assert.ok(update);
      assert.ok(destroy);
      assert.ok(update.roles.includes("authorization"));
      assert.equal(destroy.roles.includes("authorization"), false);
    },
  );
});
