import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type {
  RuntimeEvidenceCoverage,
  RuntimeEvidenceKind,
  RuntimeEvidenceTrust,
} from "./runtime-corroboration.js";

export interface RuntimeProducerManifest {
  manifest_version: "0.1";
  id: string;
  name: string;
  implementation?: string;
  producer_type: "application" | "database" | "collector" | "proxy" | "kernel" | "agent" | "external";
  supported_kinds: RuntimeEvidenceKind[];
  default_trust: RuntimeEvidenceTrust;
  default_coverage: RuntimeEvidenceCoverage;
  explicit_target_required: boolean;
  authority_scope: string[];
  can_override?: {
    trust?: boolean;
    coverage?: boolean;
    state?: boolean;
    kind?: boolean;
  };
  required_explicit_attributes?: string[];
  limitations: string[];
}

const base = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(base, "../../..");
const producerRoot = join(repoRoot, "runtime/producers");
const schema = JSON.parse(
  readFileSync(join(repoRoot, "schema/runtime-producer-manifest.schema.json"), "utf8"),
) as object;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateManifest = ajv.compile<RuntimeProducerManifest>(schema);

function readManifest(path: string): RuntimeProducerManifest {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!validateManifest(value)) {
    throw new TypeError(
      `Invalid AuditSpec runtime producer manifest ${path}: ${JSON.stringify(validateManifest.errors ?? [])}`,
    );
  }
  return value;
}

export function listRuntimeProducers(): RuntimeProducerManifest[] {
  return readdirSync(producerRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readManifest(join(producerRoot, entry.name)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getRuntimeProducer(id: string): RuntimeProducerManifest | null {
  const normalized = id.trim().toLowerCase();
  return listRuntimeProducers().find((manifest) => manifest.id.toLowerCase() === normalized) ?? null;
}
