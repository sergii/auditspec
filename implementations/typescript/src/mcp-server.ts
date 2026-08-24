#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createAuditSpecMcpServer } from "./mcp.js";

void serveStdio(createAuditSpecMcpServer);
console.error("AuditSpec MCP server running on stdio");
