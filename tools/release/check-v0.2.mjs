import { existsSync, readFileSync } from "node:fs";
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

const packageJson = json("implementations/typescript/package.json");
check(
  /^0\.2\.0(?:-rc\.\d+)?$/.test(packageJson.version),
  `TypeScript package version must be 0.2.0 or 0.2.0-rc.N, got ${packageJson.version}`,
);
check(
  packageJson.private === true,
  "TypeScript reference must remain private until npm publication is explicitly approved.",
);

const versionSource = read("implementations/typescript/src/version.ts");
const referenceMatch = versionSource.match(
  /AUDITSPEC_REFERENCE_VERSION\s*=\s*"([^"]+)"/,
);
const releaseLineMatch = versionSource.match(
  /AUDITSPEC_RELEASE_LINE\s*=\s*"([^"]+)"/,
);
const coreMatch = versionSource.match(
  /AUDITSPEC_CORE_SPEC_VERSION\s*=\s*"([^"]+)"/,
);

check(
  referenceMatch?.[1] === packageJson.version,
  "AUDITSPEC_REFERENCE_VERSION must exactly match package.json version.",
);
check(
  releaseLineMatch?.[1] === "0.2",
  "AUDITSPEC_RELEASE_LINE must remain 0.2 during the v0.2 release line.",
);
check(
  coreMatch?.[1] === "0.1",
  "AUDITSPEC_CORE_SPEC_VERSION must remain 0.1 unless Core is deliberately versioned.",
);

const coreSchema = json("schema/audit-event.schema.json");
check(
  coreSchema?.properties?.spec_version?.const === "0.1",
  "Core audit-event schema must keep spec_version const 0.1 for v0.2.",
);
check(
  typeof coreSchema?.$id === "string" &&
    coreSchema.$id.includes("/schema/0.1/"),
  "Core audit-event schema $id must remain in the immutable /schema/0.1/ family.",
);

const spec = read("SPEC.md");
check(
  spec.startsWith("# AuditSpec v0.1"),
  "SPEC.md must remain AuditSpec v0.1 for the v0.2 repository release.",
);

const readme = read("README.md");
check(
  readme.includes('Core audit-event contract intentionally remains `spec_version: "0.1"`'),
  "README status must explicitly state that v0.2 retains Core spec_version 0.1.",
);
check(
  readme.includes("docs/versioning.md"),
  "README must link the versioning document.",
);
check(
  readme.includes("docs/release-v0.2.md"),
  "README must link the v0.2 release-readiness document.",
);

const changelog = read("CHANGELOG.md");
check(
  changelog.includes("## v0.2.0 - Unreleased") ||
    /^## v0\.2\.0 - 2026-\d{2}-\d{2}$/m.test(changelog),
  "CHANGELOG must contain either an Unreleased or dated v0.2.0 section.",
);
check(
  changelog.includes('Core audit-event contract remains `spec_version: "0.1"`'),
  "CHANGELOG must preserve the Core v0.1 compatibility statement.",
);

const mcp = read("implementations/typescript/src/mcp.ts");
check(
  mcp.includes("AUDITSPEC_REFERENCE_VERSION"),
  "MCP server version must use shared release metadata rather than a stale hard-coded implementation version.",
);

const requiredFiles = [
  "implementations/typescript/src/oauth-rfc8693.ts",
  "implementations/typescript/src/http-request-evidence.ts",
  "implementations/typescript/src/assurance-attenuation.ts",
  "implementations/typescript/src/human-mandate.ts",
  "implementations/typescript/src/mandate-proof.ts",
  "implementations/typescript/src/mandate-binding-profiles.ts",
  "implementations/typescript/src/end-to-end-mandate-chain.ts",
  "mappings/oauth-rfc8693/README.md",
  "mappings/http-request-evidence/README.md",
  "mappings/human-mandate/README.md",
  "mappings/mandate-proof/README.md",
  "mappings/mandate-binding-profiles/README.md",
  "mappings/end-to-end-mandate-chain/README.md",
  "docs/assurance-invariants.md",
  "docs/versioning.md",
  "docs/release-v0.2.md",
];

for (const path of requiredFiles) {
  check(existsSync(resolve(root, path)), `Missing v0.2 release surface: ${path}`);
}

const releaseDoc = read("docs/release-v0.2.md");
check(
  releaseDoc.includes("Experimental/research surface"),
  "Release inventory must explicitly classify experimental/research APIs.",
);
check(
  releaseDoc.includes("Mappings against Internet-Drafts are research profiles"),
  "Release inventory must explicitly avoid draft protocol-conformance claims.",
);
check(
  releaseDoc.includes("No Core producer is required to emit `spec_version: \"0.2\"`"),
  "Release inventory must explicitly reject an accidental Core 0.2 requirement.",
);

const assurance = read("docs/assurance-invariants.md");
for (const heading of [
  "## 10. Assurance attenuates across dependencies",
  "## 11. General agent authority is not concrete-action authority",
  "## 12. A valid proof binds a statement, not unlimited authority",
  "## 13. Authorization projection must not widen authority",
  "## 14. Adjacent valid artifacts do not create a cross-layer binding",
]) {
  check(
    assurance.includes(heading),
    `Missing required v0.2 assurance invariant: ${heading}`,
  );
}

if (failures.length > 0) {
  console.error("AuditSpec v0.2 release-readiness checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AuditSpec v0.2 release-readiness metadata checks passed.");
console.log(`Reference implementation: ${packageJson.version}`);
console.log("Repository release line: 0.2");
console.log("Core event spec_version: 0.1");
