import { execFileSync } from "node:child_process";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const actionPath = process.env.GITHUB_ACTION_PATH;
const workspace = process.env.GITHUB_WORKSPACE;
const runnerTemp = process.env.RUNNER_TEMP;

if (!actionPath || !workspace || !runnerTemp) {
  throw new Error("AuditSpec GitHub Action requires GITHUB_ACTION_PATH, GITHUB_WORKSPACE, and RUNNER_TEMP");
}

const libraryUrl = pathToFileURL(join(actionPath, "implementations/typescript/dist/index.js")).href;
const {
  assertAssessmentDiff,
  assertAssessmentReport,
  diffAssessments,
  inspectRepository,
} = await import(libraryUrl);

function escapeCommandValue(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(value) {
  return escapeCommandValue(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function annotation(finding) {
  const file = escapeProperty(finding.location.path);
  const line = finding.location.line ?? 1;
  const title = escapeProperty(`AuditSpec ${finding.rule_id}`);
  const message = escapeCommandValue(`${finding.title} (${finding.confidence} confidence)`);
  console.log(`::warning file=${file},line=${line},title=${title}::${message}`);
}

function reachabilityAnnotation(boundary) {
  const file = escapeProperty(boundary.location.path);
  const line = boundary.location.line ?? 1;
  const entrypoint = boundary.reachability?.entrypoint;
  const via = entrypoint
    ? `${entrypoint.kind} ${entrypoint.qualified_name}`
    : "a newly resolved entrypoint";
  const title = escapeProperty("AuditSpec newly reachable mutation");
  const message = escapeCommandValue(
    `${boundary.operation} became statically reachable via ${via} (${boundary.reachability?.confidence ?? boundary.confidence} confidence); audit status: ${boundary.audit_status}`,
  );
  console.log(`::warning file=${file},line=${line},title=${title}::${message}`);
}

function percentage(value) {
  return `${Math.round(value * 100)}%`;
}

function entrypointLabel(boundary) {
  const entrypoint = boundary.reachability?.entrypoint;
  if (!entrypoint) return "unknown entrypoint";
  return `${entrypoint.kind}: ${entrypoint.qualified_name}`;
}

function writeSummary(head, diff, baselineNote) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const reachable = head.reachability?.reachable_boundaries ?? 0;
  const reachabilityText = head.coverage.detected_boundaries === 0
    ? "n/a"
    : `${reachable}/${head.coverage.detected_boundaries} (${percentage(reachable / head.coverage.detected_boundaries)})`;
  const lines = [
    "## AuditSpec",
    "",
    `- Detected boundaries: **${head.coverage.detected_boundaries}**`,
    `- Covered: **${head.coverage.covered_boundaries}**`,
    `- Partial: **${head.coverage.partial_boundaries}**`,
    `- Uncovered: **${head.coverage.uncovered_boundaries}**`,
    `- Audit coverage: **${head.coverage.detected_boundaries === 0 ? "n/a" : percentage(head.coverage.audit_coverage)}**`,
    `- Statically reachable: **${reachabilityText}**`,
  ];

  if (diff) {
    lines.push(
      `- New findings: **${diff.new_findings.length}**`,
      `- Resolved findings: **${diff.resolved_findings.length}**`,
      `- Existing findings: **${diff.unchanged_findings}**`,
      `- Coverage delta: **${diff.coverage.delta >= 0 ? "+" : ""}${Math.round(diff.coverage.delta * 100)} pp**`,
      `- Newly statically reachable boundaries: **${diff.reachability.newly_reachable.length}**`,
      `- No longer statically reachable: **${diff.reachability.no_longer_statically_reachable.length}**`,
      `- Reachability delta: **${diff.reachability.delta >= 0 ? "+" : ""}${diff.reachability.delta} boundary/boundaries**`,
    );
  } else {
    lines.push(`- Findings: **${head.findings.length}**`);
  }

  if (baselineNote) lines.push(`- Baseline: ${baselineNote}`);

  const visibleFindings = diff
    ? diff.new_findings
    : head.findings.map((finding) => ({
        fingerprint: finding.fingerprint,
        rule_id: finding.rule_id,
        title: finding.title,
        severity: finding.severity,
        confidence: finding.confidence,
        location: finding.location,
      }));

  if (visibleFindings.length > 0) {
    lines.push("", "### Findings surfaced in this run", "", "| Rule | Location | Confidence | Finding |", "| --- | --- | --- | --- |");
    for (const finding of visibleFindings) {
      lines.push(`| ${finding.rule_id} | \`${finding.location.path}:${finding.location.line ?? 1}\` | ${finding.confidence} | ${finding.title} |`);
    }
  } else {
    lines.push("", "No new AuditSpec findings were introduced by this change.");
  }

  if (diff?.reachability.newly_reachable.length > 0) {
    lines.push(
      "",
      "### Newly statically reachable boundaries",
      "",
      "| Location | Operation | Audit status | Confidence | Entrypoint |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const boundary of diff.reachability.newly_reachable) {
      lines.push(
        `| \`${boundary.location.path}:${boundary.location.line ?? 1}\` | \`${boundary.operation}\` | ${boundary.audit_status} | ${boundary.reachability.confidence} | ${entrypointLabel(boundary)} |`,
      );
    }
  }

  lines.push(
    "",
    "> AuditSpec assessment is advisory by default. Audit coverage reflects only boundaries detected by active adapters. Static reachability means a source path to a known entrypoint was resolved; it is not runtime proof or a compliance score.",
    "",
  );

  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

const head = await inspectRepository(workspace);
assertAssessmentReport(head);

const reportPath = join(runnerTemp, "auditspec-report.json");
writeFileSync(reportPath, `${JSON.stringify(head, null, 2)}\n`);

let diff = null;
let baselineNote = "not used";
const baselineMode = process.env.AUDITSPEC_BASELINE ?? "auto";
const baseRef = process.env.GITHUB_BASE_REF;

if (baselineMode !== "off" && baseRef) {
  const baseDir = join(runnerTemp, "auditspec-base-worktree");
  rmSync(baseDir, { recursive: true, force: true });

  try {
    execFileSync("git", ["-C", workspace, "fetch", "--no-tags", "--depth=1", "origin", baseRef], { stdio: "inherit" });
    execFileSync("git", ["-C", workspace, "worktree", "add", "--detach", baseDir, "FETCH_HEAD"], { stdio: "inherit" });

    const base = await inspectRepository(baseDir);
    assertAssessmentReport(base);
    diff = diffAssessments(base, head);
    assertAssessmentDiff(diff);
    baselineNote = `compared with ${baseRef}`;
  } catch (error) {
    baselineNote = "unavailable; surfaced current findings instead";
    console.log(`::notice title=AuditSpec baseline unavailable::${escapeCommandValue(error instanceof Error ? error.message : String(error))}`);
  } finally {
    try {
      execFileSync("git", ["-C", workspace, "worktree", "remove", "--force", baseDir], { stdio: "ignore" });
    } catch {
      rmSync(baseDir, { recursive: true, force: true });
    }
  }
}

const diffPath = join(runnerTemp, "auditspec-diff.json");
if (diff) writeFileSync(diffPath, `${JSON.stringify(diff, null, 2)}\n`);

const fingerprintsToAnnotate = diff ? new Set(diff.new_findings.map((finding) => finding.fingerprint)) : null;
const findingsToAnnotate = fingerprintsToAnnotate
  ? head.findings.filter((finding) => fingerprintsToAnnotate.has(finding.fingerprint))
  : head.findings;

for (const finding of findingsToAnnotate) annotation(finding);

let reachabilityWarnings = 0;
if (diff) {
  const boundaryIdsWithNewFindings = new Set(
    head.findings
      .filter((finding) => fingerprintsToAnnotate?.has(finding.fingerprint) && finding.boundary_id)
      .map((finding) => finding.boundary_id),
  );
  const headByBoundaryFingerprint = new Map(
    head.boundaries.filter((boundary) => boundary.fingerprint).map((boundary) => [boundary.fingerprint, boundary]),
  );

  for (const summary of diff.reachability.newly_reachable) {
    if (summary.audit_status === "covered") continue;
    const boundary = headByBoundaryFingerprint.get(summary.fingerprint);
    if (!boundary || boundaryIdsWithNewFindings.has(boundary.id)) continue;
    reachabilityAnnotation(summary);
    reachabilityWarnings += 1;
  }
}

writeSummary(head, diff, baselineNote);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `report_path=${reportPath}\n`);
  appendFileSync(outputPath, `diff_path=${diff ? diffPath : ""}\n`);
}

console.log(
  `AuditSpec: ${findingsToAnnotate.length} finding(s) surfaced, ${reachabilityWarnings} reachability warning(s), ${head.findings.length} total finding(s).`,
);
