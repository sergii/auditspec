# OSCAL mapping

AuditSpec can feed control-oriented assessment workflows without becoming a compliance framework itself.

The v0.1 exporter targets NIST OSCAL `1.2.3` Assessment Results. OSCAL is an external assessment representation; AuditSpec Core remains independent of OSCAL and of any particular compliance framework.

## Official conformance

Generated Assessment Results are validated in CI against the official NIST OSCAL v1.2.3 Assessment Results JSON Schema. CI downloads the pinned NIST release archive, verifies its SHA-256 digest, extracts the official schema, and validates the generated document with Ajv.

This validates structural OSCAL conformance. It does not prove that a referenced Assessment Plan, SSP, control identifier, objective identifier, or assessor conclusion is factually correct.

## Why assessment context is caller-supplied

OSCAL Assessment Results require information that AuditSpec static findings do not and should not invent:

- the controls actually reviewed;
- a finding target that references a control statement or assessment objective;
- an assessor conclusion for that target (`satisfied` or `not-satisfied`).

Therefore `schema/oscal-export-request.schema.json` requires:

- `assessment_plan_href`;
- `reviewed_control_ids`;
- `finding_targets`, keyed by stable AuditSpec finding fingerprint.

Each finding target contains:

```json
{
  "type": "statement-id",
  "target_id": "au-2_smt",
  "status": {
    "state": "not-satisfied",
    "reason": "other"
  }
}
```

These values are caller/assessor context. AuditSpec validates and projects them but never derives `satisfied` or `not-satisfied` from a source-code heuristic.

The exporter fails closed when an Assessment Report finding does not have a caller-supplied target/status mapping.

## CLI

```bash
auditspec export-oscal \
  assessment.json \
  oscal-export-request.json
```

The canonical request example is:

```text
schema/examples/oscal-export-request.json
```

## MCP

`auditspec.export_oscal` accepts two objects:

- `assessment` - a valid AuditSpec Assessment Report;
- `request` - a valid AuditSpec OSCAL Export Request.

The MCP tool uses the same request schema as the CLI/library. There is no separate agent-only OSCAL contract.

## Conceptual mapping

| AuditSpec | OSCAL Assessment Results |
| --- | --- |
| Assessment Report subject/context | imported Assessment Plan / assessment context supplied externally |
| Inspector identity + adapters | origin / tool identity |
| Finding evidence | observation + relevant evidence |
| Assessment generated time | observation `collected` |
| Finding | observation/discovery plus finding |
| Finding fingerprint | namespaced property and request mapping key |
| caller-reviewed control IDs | result `reviewed-controls` |
| caller target/status | finding `target` |
| Control Mapping Result | evidence/relevance input, not an automatic finding status |
| Remediation Plan | input to remediation/POA&M workflows, not automatically an OSCAL risk |
| Verification Result | later technical evidence, not an automatic assessor conclusion |

## Control mappings remain relevance mappings

AuditSpec Inspector rules are not control IDs.

For example:

```text
AS-AUDIT-001
    |
    +--> NIST AU-2 relevance
    +--> NIST AU-3 relevance
    +--> NIST AU-12 relevance
```

The relationship is versioned in a Control Mapping Profile. This prevents framework-specific or compliance-specific semantics from leaking into AuditSpec Core or Inspector rules.

A profile can map the same AuditSpec evidence to NIST SP 800-53, ISO/IEC 27001, SOC 2 criteria, or an organization's internal catalog without changing the Assessment Report.

The repository includes an initial NIST relevance profile:

```text
mappings/controls/nist-sp800-53-r5.2.0.json
```

Its relations are `potential_gap` or `relevant_evidence`. Neither means pass/fail.

## What the exporter does not prove

A structurally valid OSCAL document is not a completed control assessment. Formal assessment may require policy documents, interviews, configuration evidence, runtime observations, sampling, external systems, assessor judgment, and evidence outside the inspected repository.

AuditSpec therefore does not invent:

- Assessment Plan or SSP context;
- reviewed control scope;
- control/objective identifiers;
- `satisfied` / `not-satisfied` conclusions;
- evidence that was not observed;
- certification or compliance scores.

## Continuous assurance direction

```text
repository / runtime
        |
        v
AuditSpec Assessment
        |
        +--> remediation / verification
        |
        v
Control relevance mapping
        |
        +--> assessor / GRC context
        |
        v
Explicit OSCAL Export Request
        |
        v
NIST-valid OSCAL Assessment Results
        |
        v
GRC / continuous monitoring / assessor workflow
```

This lets AuditSpec provide structured technical evidence while preserving the boundary between automated evidence collection and formal control judgment.
