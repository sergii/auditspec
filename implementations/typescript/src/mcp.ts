import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { diffAssessments } from "./assessment-diff.js";
import type { AssessmentFinding, AssessmentReport } from "./assessment-types.js";
import { inspectRepository } from "./inspect.js";
import { planRemediation, verifyRemediation } from "./remediation.js";
import {
  validateAgentProfile,
  validateAssessmentReport,
  validateAuditEvent,
  validateRemediationPlan,
  validateVerificationResult,
} from "./validate.js";

const RULES: Record<string, { title: string; explanation: string; remediation: string }> = {
  "AS-AUDIT-001": {
    title: "Unaudited mutation boundary",
    explanation:
      "A mutation boundary was discovered but the active adapter could not find semantic AuditSpec evidence for the same execution surface.",
    remediation:
      "Emit a semantic AuditSpec event at the domain/service boundary, preserve the immediate actor and delegation chain, and test the audit side effect.",
  },
  "AS-ATOMIC-001": {
    title: "Mutation and audit are not visibly atomic",
    explanation:
      "The analyzer found both a mutation and audit emission but could not establish that durable business state and the audit record share a reliable commit boundary.",
    remediation:
      "Use the same database transaction when possible, or a transactional outbox when the audit sink cannot share the transaction.",
  },
  "AS-AUTH-001": {
    title: "Privileged mutation without visible authorization evidence",
    explanation:
      "The analyzer found a privileged-looking or permission-bypassing mutation but could not establish an explicit authorization decision at the same boundary.",
    remediation:
      "Make authorization explicit and record the authorization decision when it is relevant to accountability or security.",
  },
};

function asToolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
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

function invalidAssessmentResult(label: string, validation: ReturnType<typeof validateAssessmentReport>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ [label]: validation }, null, 2) }],
    isError: true,
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
      description: "Inspect a local repository and return a machine-readable AuditSpec Assessment Report.",
      inputSchema: z.object({
        path: z.string().default(".").describe("Local repository path visible to the MCP server process"),
      }),
    },
    async ({ path }) => {
      const report = await inspectRepository(path);
      const validation = validateAssessmentReport(report);
      if (!validation.valid) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(validation, null, 2) }],
          isError: true,
        };
      }
      return asToolResult(report as unknown as Record<string, unknown>);
    },
  );

  server.registerTool(
    "auditspec.get_findings",
    {
      description: "Inspect a local repository and return AuditSpec findings, optionally filtered by rule id.",
      inputSchema: z.object({
        path: z.string().default("."),
        rule_id: z.string().optional(),
      }),
    },
    async ({ path, rule_id }) => {
      const report = await inspectRepository(path);
      const findings = rule_id
        ? report.findings.filter((finding) => finding.rule_id === rule_id)
        : report.findings;
      return asToolResult({
        subject: report.subject,
        coverage: report.coverage,
        count: findings.length,
        findings: findings.map(findingSummary),
      });
    },
  );

  server.registerTool(
    "auditspec.explain_gap",
    {
      description: "Explain an AuditSpec Inspector rule and its recommended remediation.",
      inputSchema: z.object({ rule_id: z.string() }),
    },
    async ({ rule_id }) => {
      const rule = RULES[rule_id];
      if (!rule) {
        return {
          content: [{ type: "text" as const, text: `Unknown AuditSpec rule: ${rule_id}` }],
          isError: true,
        };
      }
      return asToolResult({ rule_id, ...rule });
    },
  );

  server.registerTool(
    "auditspec.diff_assessments",
    {
      description: "Compare two Assessment Reports and return new, resolved, and unchanged finding fingerprints plus coverage delta.",
      inputSchema: z.object({
        base: z.unknown(),
        head: z.unknown(),
      }),
    },
    async ({ base, head }) => {
      const baseValidation = validateAssessmentReport(base);
      const headValidation = validateAssessmentReport(head);
      if (!baseValidation.valid || !headValidation.valid) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ base: baseValidation, head: headValidation }, null, 2),
            },
          ],
          isError: true,
        };
      }
      return asToolResult(
        diffAssessments(base as AssessmentReport, head as AssessmentReport) as unknown as Record<string, unknown>,
      );
    },
  );

  server.registerTool(
    "auditspec.plan_remediation",
    {
      description:
        "Generate a structured remediation plan for open findings in an Assessment Report. This tool proposes actions but does not modify source code.",
      inputSchema: z.object({
        assessment: z.unknown(),
        fingerprints: z.array(z.string()).optional(),
      }),
    },
    async ({ assessment, fingerprints }) => {
      const validation = validateAssessmentReport(assessment);
      if (!validation.valid) return invalidAssessmentResult("assessment", validation);
      const plan = planRemediation(assessment as AssessmentReport, fingerprints);
      const planValidation = validateRemediationPlan(plan);
      if (!planValidation.valid) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(planValidation, null, 2) }],
          isError: true,
        };
      }
      return asToolResult(plan as unknown as Record<string, unknown>);
    },
  );

  server.registerTool(
    "auditspec.verify_remediation",
    {
      description:
        "Verify requested remediation fingerprints by comparing before and after Assessment Reports. Verification is scoped to the active Inspector adapters.",
      inputSchema: z.object({
        base: z.unknown(),
        head: z.unknown(),
        fingerprints: z.array(z.string()).optional(),
      }),
    },
    async ({ base, head, fingerprints }) => {
      const baseValidation = validateAssessmentReport(base);
      const headValidation = validateAssessmentReport(head);
      if (!baseValidation.valid || !headValidation.valid) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ base: baseValidation, head: headValidation }, null, 2),
            },
          ],
          isError: true,
        };
      }
      const verification = verifyRemediation(
        base as AssessmentReport,
        head as AssessmentReport,
        fingerprints,
      );
      const verificationValidation = validateVerificationResult(verification);
      if (!verificationValidation.valid) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(verificationValidation, null, 2) }],
          isError: true,
        };
      }
      return asToolResult(verification as unknown as Record<string, unknown>);
    },
  );

  return server;
}
