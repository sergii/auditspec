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

const metadata = json("release/metadata.json");
const packageJson = json("implementations/typescript/package.json");
const apiSurface = json("implementations/typescript/api-surface.json");

check(
  metadata.metadata_version === "0.1",
  "release/metadata.json metadata_version must be 0.1.",
);
check(
  ["development", "candidate", "released"].includes(metadata.stage),
  "Release metadata stage must be development, candidate, or released.",
);
check(
  /^\d+\.\d+$/.test(metadata.development_line),
  "development_line must be MAJOR.MINOR.",
);
check(
  /^\d+\.\d+\.\d+$/.test(metadata.target_release),
  "target_release must be a SemVer core version.",
);
check(
  metadata.target_release.startsWith(`${metadata.development_line}.`),
  "target_release must belong to development_line.",
);
check(
  metadata.latest_release_tag === `v${metadata.latest_release}`,
  "latest_release_tag must equal v + latest_release.",
);

if (metadata.stage === "development") {
  const escapedTarget = metadata.target_release.replaceAll(".", "\\.");
  check(
    new RegExp(`^${escapedTarget}-dev\\.\\d+$`).test(metadata.reference_version),
    `Development reference_version must match ${metadata.target_release}-dev.N.`,
  );
} else if (metadata.stage === "candidate") {
  const escapedTarget = metadata.target_release.replaceAll(".", "\\.");
  check(
    new RegExp(`^${escapedTarget}-rc\\.\\d+$`).test(metadata.reference_version),
    `Candidate reference_version must match ${metadata.target_release}-rc.N.`,
  );
} else {
  check(
    metadata.reference_version === metadata.target_release,
    "Released reference_version must exactly equal target_release.",
  );
}

check(
  packageJson.version === metadata.reference_version,
  "TypeScript package version must match release metadata reference_version.",
);
check(
  packageJson.private === true,
  "TypeScript reference must remain private until npm publication is explicitly approved.",
);
check(
  typeof packageJson.description === "string" &&
    packageJson.description.includes(`v${metadata.development_line}`),
  "TypeScript package description must name the active development line.",
);

check(
  apiSurface.package === packageJson.name,
  "API surface package name must match package.json.",
);
check(
  apiSurface.package_version === metadata.reference_version,
  "API surface package_version must match release metadata reference_version.",
);
check(
  apiSurface.core_spec_version === metadata.core_spec_version,
  "API surface core_spec_version must match release metadata.",
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
  referenceMatch?.[1] === metadata.reference_version,
  "AUDITSPEC_REFERENCE_VERSION must match release metadata.",
);
check(
  releaseLineMatch?.[1] === metadata.development_line,
  "AUDITSPEC_RELEASE_LINE must match release metadata development_line.",
);
check(
  coreMatch?.[1] === metadata.core_spec_version,
  "AUDITSPEC_CORE_SPEC_VERSION must match release metadata core_spec_version.",
);

const coreSchema = json("schema/audit-event.schema.json");
check(
  coreSchema?.properties?.spec_version?.const === metadata.core_spec_version,
  "Core audit-event schema spec_version must match release metadata.",
);
check(
  typeof coreSchema?.$id === "string" &&
    coreSchema.$id.includes(`/schema/${metadata.core_spec_version}/`),
  "Core audit-event schema $id must remain in the immutable Core schema family.",
);

const spec = read("SPEC.md");
check(
  spec.startsWith(`# AuditSpec v${metadata.core_spec_version}`),
  "SPEC.md heading must match the Core spec version, not the repository release line.",
);

const readme = read("README.md");
check(
  readme.includes(`latest tagged release is \`${metadata.latest_release_tag}\``),
  "README must identify the latest tagged release from release metadata.",
);
check(
  readme.includes(`\`main\` tracks the \`v${metadata.development_line}\` development line`),
  "README must identify the active main development line.",
);
check(
  readme.includes(
    `Core audit-event contract remains \`spec_version: "${metadata.core_spec_version}"\``,
  ),
  "README must explicitly preserve the Core spec_version boundary.",
);
check(
  readme.includes("docs/versioning.md"),
  "README must link the versioning document.",
);
check(
  readme.includes(metadata.latest_release_doc),
  "README must retain the latest release record link.",
);

const changelog = read("CHANGELOG.md");
check(
  changelog.includes(metadata.changelog_heading),
  "CHANGELOG must contain the current target-release heading from release metadata.",
);
check(
  new RegExp(
    `^## v${metadata.latest_release.replaceAll(".", "\\.")} - \\d{4}-\\d{2}-\\d{2}$`,
    "m",
  ).test(changelog),
  "CHANGELOG must retain a dated entry for latest_release.",
);
check(
  changelog.includes(
    `Core remains \`spec_version: "${metadata.core_spec_version}"\``,
  ),
  "Current changelog section must preserve the Core version boundary.",
);

const mcp = read("implementations/typescript/src/mcp.ts");
check(
  mcp.includes("AUDITSPEC_REFERENCE_VERSION"),
  "MCP server version must use shared release metadata instead of a hard-coded implementation version.",
);

check(
  existsSync(resolve(root, metadata.latest_release_doc)),
  `Latest release document is missing: ${metadata.latest_release_doc}`,
);
const latestReleaseDoc = read(metadata.latest_release_doc);
check(
  latestReleaseDoc.includes("Status: released"),
  "Latest release document must remain marked released.",
);

const versioning = read("docs/versioning.md");
check(
  versioning.includes(`Main development line | \`v${metadata.development_line}\``),
  "Versioning doc must state the active main development line.",
);
check(
  versioning.includes(
    `TypeScript reference package | \`${metadata.reference_version}\``,
  ),
  "Versioning doc must state the current reference package version.",
);
check(
  versioning.includes(
    `Latest tagged release | \`${metadata.latest_release_tag}\``,
  ),
  "Versioning doc must state the latest tagged release.",
);

const requiredBaselineFiles = [
  "docs/assurance-invariants.md",
  "docs/versioning.md",
  "docs/api-stability.md",
  "docs/core-decision-guide.md",
  "implementations/typescript/api-surface.json",
  "examples/external-sample-app/README.md",
  "tools/adoption/check-external-sample.mjs",
];

for (const path of requiredBaselineFiles) {
  check(existsSync(resolve(root, path)), `Missing release-boundary surface: ${path}`);
}

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
    `Missing permanent assurance invariant: ${heading}`,
  );
}

if (failures.length > 0) {
  console.error("AuditSpec release-boundary checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AuditSpec release-boundary checks passed.");
console.log(`Stage: ${metadata.stage}`);
console.log(`Main development line: ${metadata.development_line}`);
console.log(`Target release: ${metadata.target_release}`);
console.log(`Reference implementation: ${metadata.reference_version}`);
console.log(`Latest tagged release: ${metadata.latest_release_tag}`);
console.log(`Core event spec_version: ${metadata.core_spec_version}`);
