import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { diffCorroborationReports } from "./corroboration-diff.js";
import { createAuditSpecMcpServer } from "./mcp.js";
import { getRuntimeProducer, listRuntimeProducers } from "./runtime-producer-registry.js";
import type { RuntimeCorroborationReport } from "./runtime-corroboration.js";
import {
  validateCorroborationDiff,
  validateCorroborationReport,
} from "./validate.js";

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

export function registerRuntimeProducerRegistryTools(server: McpServer): McpServer {
  server.registerTool(
    "auditspec.list_runtime_producers",
    {
      description: "List schema-valid runtime evidence producer manifests including supported evidence kinds, default trust/coverage, authority scope, and limitations.",
      inputSchema: z.object({ producer_id: z.string().min(1).optional() }),
    },
    async ({ producer_id }) => {
      if (producer_id) {
        const manifest = getRuntimeProducer(producer_id);
        return manifest
          ? asToolResult({ count: 1, producers: [manifest] })
          : asToolResult({ count: 0, producers: [] });
      }
      const producers = listRuntimeProducers();
      return asToolResult({ count: producers.length, producers });
    },
  );

  server.registerTool(
    "auditspec.diff_runtime_corroboration",
    {
      description: "Compare two Runtime Corroboration Reports by contradicted target identity. Reports newly reported, no-longer-reported, and persisting contradictions without claiming that no-longer-reported means resolved.",
      inputSchema: z.object({ base: z.unknown(), head: z.unknown() }),
    },
    async ({ base, head }) => {
      const baseValidation = validateCorroborationReport(base);
      const headValidation = validateCorroborationReport(head);
      if (!baseValidation.valid || !headValidation.valid) {
        return validationError({ base: baseValidation, head: headValidation });
      }

      const diff = diffCorroborationReports(
        base as RuntimeCorroborationReport,
        head as RuntimeCorroborationReport,
      );
      const validation = validateCorroborationDiff(diff);
      return validation.valid
        ? asToolResult(diff as unknown as Record<string, unknown>)
        : validationError(validation);
    },
  );

  return server;
}

export function createAuditSpecReferenceMcpServer(): McpServer {
  return registerRuntimeProducerRegistryTools(createAuditSpecMcpServer());
}
