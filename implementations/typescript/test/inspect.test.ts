import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectRepository } from "../src/inspect.js";
import { validateAssessmentReport } from "../src/validate.js";

async function withRailsRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-inspect-"));

  try {
    await writeFile(join(root, "Gemfile"), 'gem "rails"\n');

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

test("inspector reports unaudited privileged Rails mutations", async () => {
  await withRailsRepo(
    {
      "app/services/refund_service.rb": [
        "class RefundService",
        "  def call(refund)",
        '    refund.update!(status: "refunded")',
        "  end",
        "end",
        "",
      ].join("\n"),
    },
    async (root) => {
      const report = await inspectRepository(root);

      assert.equal(validateAssessmentReport(report).valid, true);
      assert.equal(report.frameworks[0]?.name, "rails");
      assert.equal(report.coverage.detected_boundaries, 1);
      assert.equal(report.coverage.uncovered_boundaries, 1);
      assert.ok(report.findings.some((finding) => finding.rule_id === "AS-AUDIT-001"));
      assert.ok(report.findings.some((finding) => finding.rule_id === "AS-AUTH-001"));
    },
  );
});

test("inspector marks a visibly transactional audited mutation as covered", async () => {
  await withRailsRepo(
    {
      "app/services/invoice_approval.rb": [
        "class InvoiceApproval",
        "  def call(invoice)",
        "    authorize(invoice)",
        "    ApplicationRecord.transaction do",
        '      invoice.update!(status: "approved")',
        '      AuditSpec.emit!(action: "invoice.approve", target: invoice)',
        "    end",
        "  end",
        "end",
        "",
      ].join("\n"),
    },
    async (root) => {
      const report = await inspectRepository(root);

      assert.equal(validateAssessmentReport(report).valid, true);
      assert.equal(report.coverage.detected_boundaries, 1);
      assert.equal(report.coverage.covered_boundaries, 1);
      assert.equal(report.coverage.audit_coverage, 1);
      assert.equal(report.findings.length, 0);
    },
  );
});
