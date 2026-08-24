import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectRepository } from "../src/inspector.js";

async function withRailsRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-all-path-"));
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

test("alternate privileged entrypoint without authorization produces AS-AUTH-002", async () => {
  await withRailsRepo(
    {
      "config/routes.rb": [
        "post '/refunds/:id', to: 'refunds#perform'",
        "post '/admin/refunds/:id', to: 'admin_refunds#perform'",
      ].join("\n"),
      "app/controllers/refunds_controller.rb": [
        "class RefundsController < ApplicationController",
        "  def perform",
        "    authorize(refund)",
        "    RefundService.call(refund)",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/admin_refunds_controller.rb": [
        "class AdminRefundsController < ApplicationController",
        "  def perform",
        "    RefundService.call(refund)",
        "  end",
        "end",
      ].join("\n"),
      "app/services/refund_service.rb": [
        "class RefundService",
        "  def self.call(refund)",
        "    ApplicationRecord.transaction do",
        "      refund.update!(status: 'refunded')",
        "      AuditSpec.emit!(action: 'refund.perform')",
        "    end",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const report = await inspectRepository(root);
      const boundary = report.boundaries.find((item) => item.location.path === "app/services/refund_service.rb");
      assert.ok(boundary);
      assert.equal(boundary.audit_status, "covered");
      assert.ok(report.inspector.adapters.includes("assurance-all-path-v0.1"));
      assert.ok(report.findings.some((finding) => finding.rule_id === "AS-AUTH-002" && finding.boundary_id === boundary.id));
      assert.ok(!report.findings.some((finding) => finding.rule_id === "AS-AUTH-001" && finding.boundary_id === boundary.id));
      assert.match(
        report.findings.find((finding) => finding.rule_id === "AS-AUTH-002")?.evidence[0]?.detail ?? "",
        /AdminRefundsController#perform/,
      );
    },
  );
});

test("alternate entrypoint without audit evidence downgrades coverage and produces AS-AUDIT-002", async () => {
  await withRailsRepo(
    {
      "config/routes.rb": [
        "post '/projects/:id/archive', to: 'projects#archive'",
        "post '/admin/projects/:id/archive', to: 'admin_projects#archive'",
      ].join("\n"),
      "app/controllers/projects_controller.rb": [
        "class ProjectsController < ApplicationController",
        "  def archive",
        "    AuditSpec.emit!(action: 'project.archive')",
        "    ArchiveProject.call(project)",
        "  end",
        "end",
      ].join("\n"),
      "app/controllers/admin_projects_controller.rb": [
        "class AdminProjectsController < ApplicationController",
        "  def archive",
        "    ArchiveProject.call(project)",
        "  end",
        "end",
      ].join("\n"),
      "app/services/archive_project.rb": [
        "class ArchiveProject",
        "  def self.call(project)",
        "    project.update!(archived: true)",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const report = await inspectRepository(root);
      const boundary = report.boundaries.find((item) => item.location.path === "app/services/archive_project.rb");
      assert.ok(boundary);
      assert.equal(boundary.audit_status, "partial");
      assert.ok(report.findings.some((finding) => finding.rule_id === "AS-AUDIT-002" && finding.boundary_id === boundary.id));
      assert.ok(!report.findings.some((finding) => finding.rule_id === "AS-AUDIT-001" && finding.boundary_id === boundary.id));
    },
  );
});
