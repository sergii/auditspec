#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createAuditSpecReferenceMcpServer } from "./runtime-producer-mcp.js";

void serveStdio(createAuditSpecReferenceMcpServer);
console.error("AuditSpec MCP server running on stdio");
