# OSCAL export

AuditSpec can project an Assessment Report into an OSCAL Assessment Results document.

This is an interoperability bridge, not a compliance claim.

## Required assessment context

OSCAL Assessment Results requires an imported Assessment Plan. AuditSpec therefore requires the caller to provide `assessment_plan_href`; it never invents an Assessment Plan or SSP reference.

```bash
auditspec export-oscal assessment.json ./assessment-plan.json
```

The export maps AuditSpec findings into OSCAL observations and findings, preserves rule IDs, fingerprints, severity and confidence as namespaced properties, and records Inspector evidence as `relevant-evidence` descriptions.

The projection uses OSCAL `1.2.3` and observation type `discovery` for Inspector-discovered potential issues.

## Semantics

- AuditSpec finding -> OSCAL observation + finding
- finding evidence -> OSCAL relevant evidence
- AuditSpec rule/fingerprint/severity/confidence -> namespaced OSCAL properties
- AuditSpec Inspector -> OSCAL originating tool identity

The exporter does **not** produce control pass/fail, risk acceptance, POA&M status, or certification. Those require assessment context and assessor judgment outside the static Inspector.
