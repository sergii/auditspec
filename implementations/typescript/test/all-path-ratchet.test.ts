import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { diffAssessments } from "../src/assessment-diff.js";
import { diffAssuranceGraphs } from "../src/assurance-graph-diff.js";
import { buildAssuranceGraph } from "../src/assurance-graph.js";
import { inspectRepository } from "../src/inspector.js";

async function writeRepo(root: string, includeBypass: boolean): Promise<void> {
  await mkdir(join(root, "config"), { recursive: true });
  await mkdir(join(root, "app/controllers"), { recursive: true });
  await mkdir(join(root, "app/services"), { recursive: true });
  await writeFile(join(root, "Gemfile"), 'gem "rails"\n');

  const routes = ["post '/refunds/:id', to: 'refunds#perform'"];
  if (includeBypass) routes.push("post '/internal/refunds/:id', to: 'internal_refunds#perform'");
  await writeFile(join(root, "config/routes.rb"), `${routes.join("\n")}\n`);

  await writeFile(
    join(root, "app/controllers/refunds_controller.rb"),
    [
      "class RefundsController < ApplicationController",
      "  def perform",
      "    authorize(refund)",
      "    RefundService.call(refund)",
      "  end",
      "end",
      "",
    ].join("\n"),
  );

  if (includeBypass) {
    await writeFile(
      join(root, "app/controllers/internal_refunds_controller.rb"),
      [
        "class InternalRefundsController < ApplicationController",
        "  def perform",
        "    RefundService.call(refund)",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
  }

  await writeFile(
    join(root, "app/services/refund_service.rb"),
    [
      "class RefundService",
      "  def self.call(refund)",
      "    ApplicationRecord.transaction do",
      "      refund.update!(status: 'refunded')",
      "      AuditSpec.emit!(action: 'refund.perform')",
      "    end",
      "  end",
      "end",
      "",
    ].join("\n"),
  );
}

test("adding an unauthorized alternate route creates a new path finding and topology path", async () => {
  const base = await mkdtemp(join(tmpdir(), "auditspec-auth-ratchet-base-"));
  const head = await mkdtemp(join(tmpdir(), "auditspec-auth-ratchet-head-"));

  try {
    await writeRepo(base, false);
    await writeRepo(head, true);

    const [baseAssessment, headAssessment, baseGraph, headGraph] = await Promise.all([
      inspectRepository(base),
      inspectRepository(head),
      buildAssuranceGraph(base),
      buildAssuranceGraph(head),
    ]);

    assert.ok(!baseAssessment.findings.some((finding) => finding.rule_id.startsWith("AS-AUTH-")));
    const bypass = headAssessment.findings.find((finding) => finding.rule_id === "AS-AUTH-002");
    assert.ok(bypass);

    const assessmentDiff = diffAssessments(baseAssessment, headAssessment);
    assert.ok(assessmentDiff.new_findings.some((finding) => finding.fingerprint === bypass.fingerprint));
    assert.ok(assessmentDiff.new_findings.some((finding) => finding.rule_id === "AS-AUTH-002"));

    const topologyDiff = diffAssuranceGraphs(baseGraph, headGraph);
    assert.equal(topologyDiff.new_entrypoints.length, 1);
    assert.equal(topologyDiff.new_mutation_paths.length, 1);
    assert.match(topologyDiff.new_mutation_paths[0]!.entrypoint, /internal\/refunds/);
  } finally {
    await rm(base, { recursive: true, force: true });
    await rm(head, { recursive: true, force: true });
  }
});
