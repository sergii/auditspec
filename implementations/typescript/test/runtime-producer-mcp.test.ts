import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { createAuditSpecReferenceMcpServer } from "../src/runtime-producer-mcp.js";

test("creates the composed reference MCP server with runtime producer registry tools", () => {
  const server = createAuditSpecReferenceMcpServer();
  assert.ok(server instanceof McpServer);
});
