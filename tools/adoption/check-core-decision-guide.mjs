import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const guide = read("docs/core-decision-guide.md");
const corpus = json("examples/implementer-feedback/corpus.json");

check(
  guide.startsWith("# Core semantic decision guide"),
  "Core decision guide must keep its canonical heading.",
);
check(
  guide.includes("It does not replace the normative specification."),
  "Core decision guide must remain explicitly non-normative.",
);
check(
  guide.includes("Core-valid JSON document can still be semantically misleading"),
  "Core decision guide must preserve the schema-valid != semantic-fidelity boundary.",
);
check(
  guide.includes('evidence_status: "hypothesis"'),
  "Core decision guide must not present the feedback corpus as observed user feedback.",
);

const requiredFields = [
  "source",
  "id",
  "actor",
  "delegation",
  "action",
  "targets",
  "subjects",
  "authorization",
  "result",
  "producer",
  "evidence",
  "correlation",
  "occurred_at",
  "recorded_at",
];

for (const field of requiredFields) {
  check(
    guide.includes(field),
    `Core decision guide does not mention required decision field ${field}.`,
  );
}

for (const scenario of corpus.scenarios) {
  const marker = `<!-- scenario: ${scenario.id} -->`;
  const count = guide.split(marker).length - 1;
  check(
    count === 1,
    `Core decision guide must reference scenario ${scenario.id} exactly once; found ${count}.`,
  );
}

for (const snippet of [
  "actor is the immediate actor",
  "The array is nearest-first",
  "A positive authorization decision does not imply successful execution",
  "Evidence trust is fact-scoped",
  "Two events sharing a trace does not prove one caused the other",
  "same source\nsame id",
]) {
  check(
    guide.includes(snippet),
    `Core decision guide is missing semantic guardrail: ${snippet}`,
  );
}

if (failures.length > 0) {
  console.error("AuditSpec Core decision-guide checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AuditSpec Core decision-guide checks passed.");
console.log(`Feedback scenarios covered: ${corpus.scenarios.length}`);
