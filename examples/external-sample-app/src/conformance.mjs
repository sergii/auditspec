import {
  formatConformanceCorpusReport,
  runConformanceCorpus,
} from "@auditspec/reference-typescript";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const eventsDir = resolve(here, "../events");
const report = runConformanceCorpus(eventsDir);

process.stdout.write(formatConformanceCorpusReport(report, "./events/"));
process.exitCode = report.passed ? 0 : 1;
