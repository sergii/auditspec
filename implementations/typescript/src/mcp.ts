import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { diffAssessments } from "./assessment-diff.js";
import type { AssessmentFinding, AssessmentReport } from "./assessment-types.js";
import { diffAssuranceGraphs } from "./assurance-graph-diff.js";
import { buildAssuranceGraph, findAssurancePath } from "./assurance-graph.js";
import { mapAssessmentToControls, type ControlMappingProfile } from "./control-mapping.js";
import { queryEvidence, type EvidenceQueryFilters } from "./evidence-query.js";
import { inspectRepository } from "./inspector.js";
import { exportOscalAssessmentResults, type OscalExportRequest } from "./oscal.js";
import { planRemediation, verifyRemediation } from "./remediation.js";
import {
  validateAgentProfile,
  validateAssessmentReport,
  validateAssuranceGraph,
  validateAssuranceGraphDiff,
  validateAuditEvent,
  validateControlMappingProfile,
  validateControlMappingResult,
  validateEvidenceQueryResult,
  validateOscalExportRequest,
  validateRemediationPlan,
  validateVerificationResult,
} from "./validate.js";

interface RuleExplanation {
  title: string;
  explanation: string;
  remediation: string;
}

const RULES: Record<string, RuleExplanation> = {
  "AS-AUDIT-001": {
    title: "Unaudited mutation boundary",
    explanation: "A mutation boundary was discovered but active evidence layers could not establish semantic AuditSpec evidence for the known path.",
    remediation: "Emit a semantic AuditSpec event at the domain/service boundary that owns the mutation and test the audit side effect.",
  },
  "AS-AUDIT-002": {
    title: "Alternate reachable path lacks audit evidence",
    explanation: "Multiple entrypoint-to-mutation paths were resolved. Audit evidence exists on at least one path but is absent from another.",
    remediation: "Move semantic audit emission to a shared boundary that every mutation path crosses, or audit and test each alternate entrypoint explicitly.",
  },
  "AS-ATOMIC-001": {
    title: "Mutation and audit are not visibly atomic",
    explanation: "Mutation and audit evidence exist but the analyzer cannot establish one reliable commit boundary for durable business state and audit intent.",
    remediation: "Use the same database transaction when possible, or a transactional outbox when the audit sink cannot share the transaction.",
  },
  "AS-ATOMIC-002": {
    title: "Alternate audited path lacks transaction evidence",
    explanation: "Every resolved path contains semantic audit evidence, but transaction evidence is inconsistent across alternate entrypoints.",
    remediation: "Place mutation and durable audit behind a shared reliable commit boundary, or provide an equivalent durable handoff on each alternate path.",
  },
  "AS-AUTH-001": {
    title: "Privileged mutation without visible authorization evidence",
    explanation: "A privileged-looking or permission-bypassing mutation was found but active evidence layers could not establish an explicit authorization decision.",
    remediation: "Make authorization explicit and preserve the decision as audit evidence when relevant to accountability or security.",
  },
  "AS-AUTH-002": {
    title: "Alternate reachable path bypasses visible authorization",
    explanation: "A privileged mutation has multiple resolved entrypoint paths. Authorization evidence exists on at least one path and is absent from another.",
    remediation: "Put authorization at a shared boundary that dominates every privileged path, or explicitly authorize and test each alternate entrypoint.",
  },
};

function asToolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function validationError(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError: true,
  };
}

function findingSummary(finding: AssessmentFinding): Record<string, unknown> {
  return {
    id: finding.id,
    fingerprint: finding.fingerprint,
    rule_id: finding.rule_id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    location: finding.location,
    message: finding.message,
    remediation: finding.remediation,
  };
}

export function createAuditSpecMcpServer(): McpServer {
  const server = new McpServer({ name: "auditspec", version: "0.1.0-draft" });

  server.registerTool(
    "auditspec.validate_event",
    {
      description: "Validate one AuditSpec Core event against the v0.1 schema.",
      inputSchema: z.object({ event: z.unknown() }),
    },
    async ({ event }) => asToolResult(validateAuditEvent(event) as unknown as Record<string, unknown>),
  );

  server.registerTool(
    "auditspec.validate_agent_profile",
    {
      description: "Validate dev.auditspec.agent extension data against the Agent Profile v0.1 schema.",
      inputSchema: z.object({ profile: z.unknown() }),
    },
    async ({ profile }) => asToolResult(validateAgentProfile(profile) as unknown as Record<string, unknown>),
  );

  server.registerTool(
    "auditspec.inspect",
    {
      description: "Inspect a local repository with the canonical all-path Inspector and return an Assessment Report.",
      inputSchema: z.object({ path: z.string().default(".") }),
    },
    async ({ path }) => {
      const report = await inspectRepository(path);
      const validation = validateAssessmentReport(report);
      return validation.valid
        ? asToolResult(report as unknown as Record<string, unknown>)
        : validationError(validation);
    },
  );

  server.registerTool(
    "auditspec.build_assurance_graph",
    {
      description: "Build a conservative cross-file Assurance Graph. Ambiguous dynamic calls remain unresolved evidence.",
      inputSchema: z.object({ path: z.string().default(".") }),
    },
    async ({ path }) => {
      const graph = await buildAssuranceGraph(path);
      const validation = validateAssuranceGraph(graph);
      return validation.valid
        ? asToolResult(graph as unknown as Record<string, unknown>)
        : validationError(validation);
    },
  );

  server.registerTool(
    "auditspec.diff_assurance_graphs",
    {
      description: "Compare two repositories as Assurance Graphs and report topology changes including new entrypoints, framework dispatches, and mutation paths.",
      inputSchema: z.object({ base_path: z.string().min(1), head_path: z.string().min(1) }),
    },
    async ({ base_path, head_path }) => {
      const [base, head] = await Promise.all([buildAssuranceGraph(base_path), buildAssuranceGraph(head_path)]);
      const baseValidation = validateAssuranceGraph(base);
      const headValidation = validateAssuranceGraph(head);
      if (!baseValidation.valid || !headValidation.valid) {
        return validationError({ base: baseValidation, head: headValidation });
      }
      const diff = diffAssuranceGraphs(base, head);
      const validation = validateAssuranceGraphDiff(diff);
      return validation.valid
        ? asToolResult(diff as unknown as Record<string, unknown>)
        : validationError(validation);
    },
  );

  server.registerTool(
    "auditspec.find_assurance_path",
    {
      description: "Resolve the best static assurance path for a repository-relative source location and report roles proven on that path.",
      inputSchema: z.object({
        path: z.string().default("."),
        source_path: z.string().min(1),
        line: z.number().int().positive(),
        column: z.number().int().positive().default(1),
      }),
    },
    async ({ path, source_path, line, column }) => {
      const graph = await buildAssuranceGraph(path);
      const validation = validateAssuranceGraph(graph);
      if (!validation.valid) return validationError(validation);
      const assurancePath = findAssurancePath(graph, { path: source_path, line, column });
      return asToolResult({
        subject: graph.subject,
        location: { path: source_path, line, column },
        found: assurancePath !== null,
        path: assurancePath,
      });
    },
  );

  server.registerTool(
    "auditspec.get_findings",
    {
      description: "Inspect a local repository and return findings, optionally filtered by stable rule id.",
      inputSchema: z.object({ path: z.string().default("."), rule_id: z.string().optional() }),
    },
    async ({ path, rule_id }) => {
      const report = await inspectRepository(path);
      const findings = rule_id ? report.findings.filter((finding) => finding.rule_id === rule_id) : report.findings;
      return asToolResult({
        subject: report.subject,
        coverage: report.coverage,
        reachability: report.reachability,
        count: findings.length,
        findings: findings.map(findingSummary),
      });
    },
  );

  server.registerTool(
    "auditspec.explain_gap",
    {
      description: "Explain a stable AuditSpec Inspector rule and recommended remediation.",
      inputSchema: z.object({ rule_id: z.string() }),
    },
    async ({ rule_id }) => {
      const rule = RULES[rule_id];
      return rule
        ? asToolResult({ rule_id, ...rule })
        : { content: [{ type: "text" as const, text: `Unknown AuditSpec rule: ${rule_id}` }], isError: true };
    },
  );

  server.registerTool(
    "auditspec.diff_assessments",
    {
      description: "Compare two Assessment Reports using stable finding/boundary fingerprints, audit coverage, and reachability deltas.",
      inputSchema: z.object({ base: z.unknown(), head: z.unknown() }),
    },
    async ({ base, head }) => {
      const baseValidation = validateAssessmentReport(base);
      const headValidation = validateAssessmentReport(head);
      if (!baseValidation.valid || !headValidation.valid) {
        return validationError({ base: baseValidation, head: headValidation });
      }
      return asToolResult(diffAssessments(base as AssessmentReport, head as AssessmentReport) as unknown as Record<string, unknown>);
    },
  );

  server.registerTool(
    "auditspec.plan_remediation",
    {
      description: "Generate a structured remediation plan for open findings without modifying source code.",
      inputSchema: z.object({ assessment: z.unknown(), fingerprints: z.array(z.string()).optional() }),
    },
    async ({ assessment, fingerprints }) => {
      const validation = validateAssessmentReport(assessment);
      if (!validation.valid) return validationError(validation);
      const plan = planRemediation(assessment as AssessmentReport, fingerprints);
      const planValidation = validateRemediationPlan(plan);
      return planValidation.valid
        ? asToolResult(plan as unknown as Record<string, unknown>)
        : validationError(planValidation);
    },
  );

  server.registerTool(
    "auditspec.verify_remediation",
    {
      description: "Verify requested finding fingerprints by comparing before/after Assessment Reports.",
      inputSchema: z.object({ base: z.unknown(), head: z.unknown(), fingerprints: z.array(z.string()).optional() }),
    },
    async ({ base, head, fingerprints }) => {
      const baseValidation = validateAssessmentReport(base);
      const headValidation = validateAssessmentReport(head);
      if (!baseValidation.valid || !headValidation.valid) {
        return validationError({ base: baseValidation, head: headValidation });
      }
      const verification = verifyRemediation(base as AssessmentReport, head as AssessmentReport, fingerprints);
      const validation = validateVerificationResult(verification);
      return validation.valid
        ? asToolResult(verification as unknown as Record<string, unknown>)
        : validationError(validation);
    },
  );

  server.registerTool(
    "auditspec.map_controls",
    {
      description: "Map findings/evidence to external controls through a versioned profile without pass/fail claims.",
      inputSchema: z.object({ assessment: z.unknown(), profile: z.unknown() }),
    },
    async ({ assessment, profile }) => {
      const assessmentValidation = validateAssessmentReport(assessment);
      const profileValidation = validateControlMappingProfile(profile);
      if (!assessmentValidation.valid || !profileValidation.valid) {
        return validationError({ assessment: assessmentValidation, profile: profileValidation });
      }
      const result = mapAssessmentToControls(assessment as AssessmentReport, profile as ControlMappingProfile);
      const validation = validateControlMappingResult(result);
      return validation.valid
        ? asToolResult(result as unknown as Record<string, unknown>)
        : validationError(validation);
    },
  );

  server.registerTool(
    "auditspec.query_evidence",
    {
      description: "Query evidence already present in an Assessment Report by kind, rule, path, confidence, or source object.",
      inputSchema: z.object({
        assessment: z.unknown(),
        kind: z.string().optional(),
        rule_id: z.string().optional(),
        path: z.string().optional(),
        confidence: z.enum(["certain", "high", "medium", "low"]).optional(),
        source: z.enum(["boundary", "finding"]).optional(),
      }),
    },
    async ({ assessment, kind, rule_id, path, confidence, source }) => {
      const validation = validateAssessmentReport(assessment);
      if (!validation.valid) return validationError(validation);
      const filters: EvidenceQueryFilters = {
        ...(kind ? { kind } : {}),
        ...(rule_id ? { rule_id } : {}),
        ...(path ? { path } : {}),
        ...(confidence ? { confidence } : {}),
        ...(source ? { source } : {}),
      };
      const result = queryEvidence(assessment as AssessmentReport, filters);
      const resultValidation = validateEvidenceQueryResult(result);
      return resultValidation.valid
        ? asToolResult(result as unknown as Record<string, unknown>)
        : validationError(resultValidation);
    },
  );

  server.registerTool(
    "auditspec.export_oscal",
    {
      description: "Project an Assessment Report into OSCAL 1.2.3 Assessment Results using an explicit governing Assessment Plan href.",
      inputSchema: z.object({
        assessment: z.unknown(),
        assessment_plan_href: z.string().min(1),
        title: z.string().optional(),
        description: z.string().optional(),
        version: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
      }),
    },
    async ({ assessment, assessment_plan_href, title, description, version, start, end }) => {
      const assessmentValidation = validateAssessmentReport(assessment);
      const request: OscalExportRequest = {
        assessment_plan_href,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(version ? { version } : {}),
        ...(start ? { start } : {}),
        ...(end ? { end } : {}),
      };
      const requestValidation = validateOscalExportRequest(request);
      if (!assessmentValidation.valid || !requestValidation.valid) {
        return validationError({ assessment: assessmentValidation, request: requestValidation });
      }
      return asToolResult(exportOscalAssessmentResults(assessment as AssessmentReport, request) as unknown as Record<string, unknown>);
    },
  );

  return server;
}
