import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";

test("builds a conservative cross-file Rails assurance path", async () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-graph-"));
  try {
    mkdirSync(join(root, "app/controllers"), { recursive: true });
    mkdirSync(join(root, "app/services"), { recursive: true });
    writeFileSync(
      join(root, "app/controllers/invoices_controller.rb"),
      [
        "class InvoicesController < ApplicationController",
        "  def approve",
        "    authorize(invoice)",
        "    ApproveInvoice.call(invoice)",
        "  end",
        "end",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "app/services/approve_invoice.rb"),
      [
        "class ApproveInvoice",
        "  def self.call(invoice)",
        "    ApplicationRecord.transaction do",
        "      invoice.update!(status: 'approved')",
        "      AuditSpec.emit!(action: 'invoice.approve')",
        "    end",
        "  end",
        "end",
      ].join("\n"),
    );

    const graph = await buildAssuranceGraph(root);
    assert.equal(graph.summary.entrypoints, 1);
    assert.equal(graph.summary.mutation_nodes, 1);
    assert.equal(graph.summary.audit_nodes, 1);
    assert.ok(graph.edges.some((edge) => edge.call.callee === "ApproveInvoice.call"));

    const path = findAssurancePath(graph, {
      path: "app/services/approve_invoice.rb",
      line: 4,
      column: 7,
    });
    assert.ok(path);
    assert.ok(path.roles.includes("entrypoint"));
    assert.ok(path.roles.includes("authorization"));
    assert.ok(path.roles.includes("transaction"));
    assert.ok(path.roles.includes("mutation"));
    assert.ok(path.roles.includes("audit"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not resolve an ambiguous method name", async () => {
  const root = mkdtempSync(join(tmpdir(), "auditspec-graph-"));
  try {
    mkdirSync(join(root, "app/controllers"), { recursive: true });
    mkdirSync(join(root, "app/services"), { recursive: true });
    writeFileSync(
      join(root, "app/controllers/jobs_controller.rb"),
      [
        "class JobsController < ApplicationController",
        "  def run",
        "    call",
        "  end",
        "end",
      ].join("\n"),
    );
    writeFileSync(join(root, "app/services/a.rb"), "class A\n  def call\n    puts 'a'\n  end\nend\n");
    writeFileSync(join(root, "app/services/b.rb"), "class B\n  def call\n    puts 'b'\n  end\nend\n");

    const graph = await buildAssuranceGraph(root);
    assert.equal(graph.edges.length, 0);
    assert.ok(graph.unresolved_calls.some((call) => call.reason === "ambiguous"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
