#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { normalizeAuditEvent } from "./normalize.js";
import { redactAuditEvent } from "./redact.js";
import { toCloudEvent } from "./cloudevents.js";
import { assertAuditEvent, validateAgentProfile, validateAuditEvent } from "./validate.js";
import type { AuditEvent } from "./types.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): never {
  process.stderr.write(
    [
      "Usage:",
      "  auditspec validate <event.json>",
      "  auditspec validate-agent <profile.json>",
      "  auditspec normalize <event.json>",
      "  auditspec redact <event.json>",
      "  auditspec to-cloudevent <event.json>",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const [, , command, path] = process.argv;
if (!command || !path) usage();

try {
  const input = readJson(path);

  switch (command) {
    case "validate": {
      const result = validateAuditEvent(input);
      print(result);
      process.exitCode = result.valid ? 0 : 1;
      break;
    }
    case "validate-agent": {
      const result = validateAgentProfile(input);
      print(result);
      process.exitCode = result.valid ? 0 : 1;
      break;
    }
    case "normalize": {
      assertAuditEvent(input);
      print(normalizeAuditEvent(input));
      break;
    }
    case "redact": {
      assertAuditEvent(input);
      print(redactAuditEvent(input));
      break;
    }
    case "to-cloudevent": {
      assertAuditEvent(input);
      print(toCloudEvent(input as AuditEvent));
      break;
    }
    default:
      usage();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
