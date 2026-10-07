import { inspectFrappeRepository } from "../../frappe-inspect.js";
import type { InspectorFrameworkPlugin } from "../plugin.js";

export const frappeInspectorPlugin: InspectorFrameworkPlugin = {
  id: "frappe-ast-assisted-v0.1",
  framework: "frappe",
  confidence: "high",
  async inspect(root) {
    const result = await inspectFrappeRepository(root);
    return {
      detected: result.detected,
      evidence: result.frameworkEvidence,
      boundaries: result.boundaries,
      findings: result.findings,
      ast_failures: result.astFailures,
    };
  },
  assurance: {
    auditStatus(_boundary, path) {
      return path.roles.includes("audit") ? "partial" : "uncovered";
    },
    entrypointKind(qualifiedName) {
      if (qualifiedName.startsWith("frappe.frappe_doc_event:")) return "frappe_doc_event";
      if (qualifiedName.startsWith("frappe.frappe_scheduler:")) return "frappe_scheduler";
      return "frappe_entrypoint";
    },
  },
};
