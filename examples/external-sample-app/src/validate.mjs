import { validateAuditEvent } from "@auditspec/reference-typescript";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const eventPath = resolve(here, "../events/invoice-paid.json");
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const result = validateAuditEvent(event);

if (!result.valid) {
  process.stderr.write(
    `FAIL invoice-paid.json - ${result.errors.length} validation error(s)\n`,
  );
  for (const error of result.errors) {
    process.stderr.write(
      `  ${error.instancePath || "/"}: ${error.message ?? error.keyword}\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    "PASS invoice-paid.json - valid AuditSpec Core 0.1 event\n",
  );
}
