# OSCAL mapping

AuditSpec can feed control-oriented assessment workflows without becoming a compliance framework itself.

The first target is the NIST OSCAL Assessment Results model. AuditSpec v0.1 treats OSCAL as an external representation for assessment subjects, observations/evidence, findings, and reviewed controls.

## Version

This mapping is designed against OSCAL `1.2.3` Assessment Results semantics.

AuditSpec does not vendor the OSCAL schemas. A future `export-oscal` implementation MUST be validated against the official NIST OSCAL schemas before it is described as OSCAL-conformant output.

## Conceptual mapping

| AuditSpec | OSCAL Assessment Results |
| --- | --- |
| Assessment Report `subject` | assessment subject / referenced component |
| Inspector identity + adapters | origin / tool identity |
| Boundary evidence | observation + relevant evidence |
| Finding | observation/discovery plus finding where appropriate |
| Finding fingerprint | stable AuditSpec property/reference used for correlation |
| Control Mapping Result | reviewed-control/control-objective relevance input |
| Remediation Plan | input to risk/response/POA&M workflows, not automatically an OSCAL risk |
| Verification Result | later assessment evidence / changed observation status |

## Why there is an intermediate control mapping

AuditSpec Inspector rules are not control IDs.

For example:

```text
AS-AUDIT-001
    |
    +--> NIST AU-2 relevance
    +--> NIST AU-3 relevance
    +--> NIST AU-12 relevance
```

The relationship is versioned in a Control Mapping Profile. This prevents framework-specific semantics from leaking into AuditSpec Core or Inspector rules.

A profile can map the same AuditSpec evidence to:

- NIST SP 800-53
- ISO/IEC 27001
- SOC 2 criteria
- an organization's internal control catalog

without changing the Assessment Report.

## No automatic pass/fail

A mapping relation is one of:

- `potential_gap`
- `relevant_evidence`

Neither means that an external control has passed or failed.

A real control assessment may require policy documents, interviews, configuration evidence, runtime observations, sampling, human judgment, and evidence outside the inspected repository.

AuditSpec MUST preserve this distinction in user interfaces and machine-readable exports.

## Initial NIST profile

The repository includes:

```text
mappings/controls/nist-sp800-53-r5.2.0.json
```

It is a deliberately small initial crosswalk for the first Inspector rules. The profile contains only relevance relationships and rationale. It does not reproduce the control catalog and does not replace NIST's authoritative content.

Use it with the CLI:

```bash
auditspec map-controls \
  assessment.json \
  mappings/controls/nist-sp800-53-r5.2.0.json
```

or pass the same profile to MCP tool `auditspec.map_controls`.

## Future OSCAL export

A future exporter should accept at minimum:

- an AuditSpec Assessment Report
- a Control Mapping Result
- a reference to the governing OSCAL Assessment Plan
- stable subject/component UUIDs from the OSCAL SSP/AP context
- the explicit set of reviewed controls

and produce Assessment Results containing:

1. required OSCAL document metadata
2. `import-ap`
3. assessment result start/end timestamps
4. actual assessment subjects
5. reviewed controls
6. AuditSpec-derived observations and evidence
7. findings linked to observations where semantically justified
8. AuditSpec identifiers/fingerprints as namespaced properties for round-trip correlation

The exporter MUST NOT invent assessment-plan context, control status, subject UUIDs, or evidence that AuditSpec did not observe.

## Continuous assurance

The intended long-term flow is:

```text
repository / runtime
        |
        v
AuditSpec Assessment
        |
        +--> remediation / verification
        |
        v
Control Mapping Profile
        |
        v
Control Evidence Mapping
        |
        v
OSCAL Assessment Results
        |
        v
GRC / continuous monitoring / assessor workflow
```

This makes AuditSpec a source of structured technical evidence while leaving formal control interpretation and certification to the appropriate assessment process.
