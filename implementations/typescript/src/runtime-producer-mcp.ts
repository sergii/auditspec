import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createAuditSpecMcpServer } from "./mcp.js";
import { getRuntimeProducer, listRuntimeProducers } from "./runtime-producer-registry.js";

function asToolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
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

  return server;
}

export function createAuditSpecReferenceMcpServer(): McpServer {
  return registerRuntimeProducerRegistryTools(createAuditSpecMcpServer());
}
