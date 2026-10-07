import {
  normalizeAuditEvent,
  validateAuditEvent,
} from "@auditspec/reference-typescript";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const eventsDir = resolve(appRoot, "events");
const eventPath = resolve(eventsDir, "invoice-paid.json");

const event = normalizeAuditEvent({
  spec_version: "0.1",
  id: "aud_external_sample_invoice_0042",
  source: "urn:example:external-billing-app",
  actor: {
    type: "user",
    id: "42",
  },
  action: "invoice.pay",
  action_version: 1,
  targets: [
    {
      type: "invoice",
      id: "INV-0042",
      role: "primary",
    },
  ],
  authorization: {
    decision: "allowed",
    scopes: ["invoice:pay"],
    policy: {
      id: "billing-payment-policy",
      version: "1",
    },
  },
  result: {
    status: "succeeded",
  },
  producer: {
    name: "external-billing-app",
    version: "0.1.0",
  },
  correlation: {
    request_id: "req_external_sample_001",
    trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
  },
  evidence: [
    {
      kind: "authorization_decision",
      producer: {
        name: "billing-policy",
        version: "1.0.0",
      },
      trust: "authoritative",
    },
    {
      kind: "execution",
      producer: {
        name: "external-billing-app",
        version: "0.1.0",
      },
      trust: "authoritative",
    },
  ],
  occurred_at: "2026-10-07T12:00:00Z",
  recorded_at: "2026-10-07T12:00:00.005Z",
});

const validation = validateAuditEvent(event);
if (!validation.valid) {
  throw new TypeError(
    `Sample app generated an invalid AuditSpec event: ${JSON.stringify(validation.errors)}`,
  );
}

mkdirSync(eventsDir, { recursive: true });
writeFileSync(eventPath, `${JSON.stringify(event, null, 2)}\n`, "utf8");

process.stdout.write(`EMIT ${eventPath}\n`);
