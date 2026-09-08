import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { diffAssuranceGraphs } from "../src/assurance-graph-diff.js";
import { buildAssuranceGraph } from "../src/assurance-graph.js";

async function writeRepo(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content);
  }
}

test("topology diff detects a new Rails route exposing an existing mutation", async () => {
  const base = await mkdtemp(join(tmpdir(), "auditspec-topology-base-"));
  const head = await mkdtemp(join(tmpdir(), "auditspec-topology-head-"));

  try {
    const service = [
      "class RefundService",
      "  def self.call(refund)",
      "    refund.update!(status: 'refunded')",
      "  end",
      "end",
      "",
    ].join("\n");

    await writeRepo(base, {
      "app/services/refund_service.rb": service,
    });

    await writeRepo(head, {
      "app/services/refund_service.rb": service,
      "config/routes.rb": "post '/refunds/:id', to: 'refunds#perform'\n",
      "app/controllers/refunds_controller.rb": [
        "class RefundsController < ApplicationController",
        "  def perform",
        "    RefundService.call(refund)",
        "  end",
        "end",
        "",
      ].join("\n"),
    });

    const baseGraph = await buildAssuranceGraph(base);
    const headGraph = await buildAssuranceGraph(head);
    const diff = diffAssuranceGraphs(baseGraph, headGraph);

    assert.equal(diff.new_entrypoints.length, 1);
    assert.equal(diff.new_framework_dispatches.length, 1);
    assert.equal(diff.new_mutation_paths.length, 1);
    assert.equal(diff.removed_mutation_paths.length, 0);
    assert.equal(diff.summary.mutation_path_delta, 1);
    assert.match(diff.new_mutation_paths[0]!.entrypoint, /rails_route/);
    assert.equal(diff.new_mutation_paths[0]!.mutation, "RefundService#call");
  } finally {
    await rm(base, { recursive: true, force: true });
    await rm(head, { recursive: true, force: true });
  }
});

test("topology diff does not treat line movement as a new entrypoint", async () => {
  const base = await mkdtemp(join(tmpdir(), "auditspec-topology-lines-base-"));
  const head = await mkdtemp(join(tmpdir(), "auditspec-topology-lines-head-"));

  try {
    const controller = [
      "class RefundsController < ApplicationController",
      "  def perform",
      "    RefundService.call(refund)",
      "  end",
      "end",
      "",
    ].join("\n");
    const service = [
      "class RefundService",
      "  def self.call(refund)",
      "    refund.update!(status: 'refunded')",
      "  end",
      "end",
      "",
    ].join("\n");

    await writeRepo(base, {
      "config/routes.rb": "post '/refunds/:id', to: 'refunds#perform'\n",
      "app/controllers/refunds_controller.rb": controller,
      "app/services/refund_service.rb": service,
    });
    await writeRepo(head, {
      "config/routes.rb": "\n\npost '/refunds/:id', to: 'refunds#perform'\n",
      "app/controllers/refunds_controller.rb": controller,
      "app/services/refund_service.rb": service,
    });

    const diff = diffAssuranceGraphs(await buildAssuranceGraph(base), await buildAssuranceGraph(head));
    assert.equal(diff.new_entrypoints.length, 0);
    assert.equal(diff.removed_entrypoints.length, 0);
    assert.equal(diff.new_mutation_paths.length, 0);
    assert.equal(diff.unchanged_mutation_paths, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
    await rm(head, { recursive: true, force: true });
  }
});
