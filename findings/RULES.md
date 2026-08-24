# AuditSpec Inspector rules

AuditSpec findings are evidence-backed assessment results, not compliance verdicts. A finding must identify the rule, location, evidence, severity, and confidence used to reach the conclusion.

The initial inspector is deliberately conservative and framework-aware. It uses source heuristics for Rails while the assessment/report model is framework-neutral.

## AS-AUDIT-001 - Unaudited mutation boundary

A mutation-like Rails call was detected and no visible `AuditSpec.emit!` / `AuditSpec.record!` marker was found in the same source file.

- Severity: `warning`
- Initial confidence: `medium`
- Desired remediation: emit a semantic AuditSpec event at the service/domain boundary that owns the mutation.

This rule cannot prove absence across dynamic dispatch or calls into another service object. Future AST/call-graph adapters should raise confidence when they can prove reachability.

## AS-ATOMIC-001 - Mutation and audit not visibly atomic

A source file contains both a mutation-like Rails call and an AuditSpec emission marker, but no visible Active Record transaction boundary.

- Severity: `warning`
- Initial confidence: `low`
- Desired remediation: couple the business mutation and durable audit write in one transaction when they share a database, or use a transactional outbox when they do not.

This is intentionally low confidence because the transaction may be established by a caller or by an adapter implementation.

## AS-AUTH-001 - Privileged mutation without visible authorization evidence

A mutation occurs in code whose path or source line looks privileged (`delete`, `destroy`, `refund`, `approve`, role/permission changes, impersonation, grant/revoke, cancel), but no common Rails authorization marker is visible in the same file.

- Severity: `warning`
- Initial confidence: `low`
- Desired remediation: make the authorization boundary explicit and audit the authorization decision when it is security or accountability relevant.

This rule is a discovery heuristic, not proof that authorization is absent.

## Confidence semantics

- `certain` - directly established by machine-readable evidence or a semantics-preserving adapter.
- `high` - strong static/runtime evidence with limited ambiguity.
- `medium` - useful source-level inference with known cross-file/dynamic limitations.
- `low` - heuristic signal that deserves review but must not be treated as a proven defect.

GitHub and CI integrations should remain advisory by default and should surface confidence alongside every finding.
