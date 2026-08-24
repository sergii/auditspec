import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { diffAssessments } from "../src/assessment-diff.js";
import { inspectRepository } from "../src/inspect.js";
import { validateAssessmentDiff, validateAssessmentReport } from "../src/validate.js";

test("adding a Rails route makes an existing unaudited mutation newly reachable without creating a new finding", async () => {
  const root = await mkdtemp(join(tmpdir(), "auditspec-ratchet-"));
  try {
    await writeFile(join(root, "Gemfile"), 'gem "rails"\n');
    await mkdir(join(root, "app/services"), { recursive: true });
    await writeFile(
      join(root, "app/services/refund_service.rb"),
      [
        "class RefundService",
        "  def self.call(refund)",
        "    refund.update!(status: 'refunded')",
        "  end",
        "end",
        "",
      ].join("\n"),
    );

    const base = await inspectRepository(root);
    assert.equal(validateAssessmentReport(base).valid, true);
    assert.equal(base.boundaries.length, 1);
    assert.ok(base.boundaries[0]?.fingerprint);
    assert.equal(base.boundaries[0]?.reachability?.status, "unknown");
    assert.ok(base.findings.some((finding) => finding.rule_id === "AS-AUDIT-001"));

    await mkdir(join(root, "config"), { recursive: true });
    await mkdir(join(root, "app/controllers"), { recursive: true });
    await writeFile(
      join(root, "config/routes.rb"),
      "post '/refunds/:id', to: 'refunds#perform'\n",
    );
    await writeFile(
      join(root, "app/controllers/refunds_controller.rb"),
      [
        "class RefundsController < ApplicationController",
        "  def perform",
        "    RefundService.call(refund)",
        "  end",
        "end",
        "",
      ].join("\n"),
    );

    const head = await inspectRepository(root);
    assert.equal(validateAssessmentReport(head).valid, true);
    assert.equal(head.boundaries.length, 1);
    assert.equal(head.boundaries[0]?.fingerprint, base.boundaries[0]?.fingerprint);
    assert.equal(head.boundaries[0]?.reachability?.status, "reachable");
    assert.equal(head.boundaries[0]?.reachability?.entrypoint?.kind, "rails_route");

    const diff = diffAssessments(base, head);
    assert.equal(validateAssessmentDiff(diff).valid, true);
    assert.equal(diff.new_findings.length, 0);
    assert.ok(diff.unchanged_findings >= 1);
    assert.equal(diff.reachability.newly_reachable.length, 1);
    assert.equal(diff.reachability.newly_reachable[0]?.fingerprint, base.boundaries[0]?.fingerprint);
    assert.equal(diff.reachability.newly_reachable[0]?.audit_status, "uncovered");
    assert.equal(diff.reachability.no_longer_statically_reachable.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
