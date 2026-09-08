import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export type FrameworkLayerStatus = "implemented" | "partial" | "planned" | "not_applicable";
export type FrameworkProofLevel = "schema" | "contract" | "framework_runtime" | "pinned_real_world_static" | "runtime" | "none";

export interface FrameworkAdapterLayer {
  status: FrameworkLayerStatus;
  proof: FrameworkProofLevel;
  adapter_id?: string;
  evidence: string[];
  limitations?: string[];
}

export interface FrameworkAdapterManifest {
  manifest_version: "0.1";
  id: string;
  framework: string;
  language: string;
  framework_versions?: string[];
  language_versions?: string[];
  layers: {
    language_reference: FrameworkAdapterLayer;
    transaction_adapter: FrameworkAdapterLayer;
    behavioral_runtime_lab: FrameworkAdapterLayer;
    inspector_adapter: FrameworkAdapterLayer;
    runtime_corroboration: FrameworkAdapterLayer;
  };
  transaction: {
    ownership: string;
    hidden_commit: boolean;
    same_store_atomicity: "supported" | "partial" | "unsupported" | "unknown";
    durable_outbox: "supported" | "partial" | "unsupported" | "unknown";
    after_commit_wakeup: "supported" | "partial" | "unsupported" | "unknown";
    special_cases?: Array<{ operation: string; semantics: string }>;
  };
  references?: string[];
}

const base = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(base, "../../..");
const frameworkRoot = join(repoRoot, "frameworks");
const schema = JSON.parse(
  readFileSync(join(repoRoot, "schema/framework-adapter-manifest.schema.json"), "utf8"),
) as object;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateManifest = ajv.compile<FrameworkAdapterManifest>(schema);

function readManifest(path: string): FrameworkAdapterManifest {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!validateManifest(value)) {
    throw new TypeError(
      `Invalid AuditSpec framework adapter manifest ${path}: ${JSON.stringify(validateManifest.errors ?? [])}`,
    );
  }
  return value;
}

export function listFrameworkAdapters(): FrameworkAdapterManifest[] {
  return readdirSync(frameworkRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(frameworkRoot, entry.name, "adapter.json"))
    .filter((path) => {
      try {
        readFileSync(path, "utf8");
        return true;
      } catch {
        return false;
      }
    })
    .map(readManifest)
    .sort((left, right) => left.framework.localeCompare(right.framework));
}

export function getFrameworkAdapter(framework: string): FrameworkAdapterManifest | null {
  const normalized = framework.trim().toLowerCase();
  return listFrameworkAdapters().find((manifest) => manifest.framework.toLowerCase() === normalized) ?? null;
}
