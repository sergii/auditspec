import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/server";
import { createAuditSpecMcpServer } from "../src/mcp.js";

test("creates an MCP v2 server", () => {
  const server = createAuditSpecMcpServer();
  assert.ok(server instanceof McpServer);
});
