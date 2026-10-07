import { explainAuditEvent } from "@auditspec/reference-typescript";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const eventPath = resolve(here, "../events/invoice-paid.json");
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const explanation = explainAuditEvent(event);

process.stdout.write(
  [
    `ACTOR ${explanation.actor}`,
    `ACTION ${explanation.action}`,
    `AUTHORIZATION ${explanation.authorization}`,
    `RESULT ${explanation.result}`,
    `EVIDENCE ${explanation.evidence.count}`,
    "",
  ].join("\n"),
);
