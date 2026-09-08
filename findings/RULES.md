# AuditSpec Inspector rules

AuditSpec findings are evidence-backed assessment results, not compliance verdicts. A finding identifies the rule, location, evidence, severity, and confidence used to reach the conclusion.

The v0.1 Rails and Frappe adapters use ast-grep/Tree-sitter for executable call discovery, a conservative Assurance Graph for cross-file/framework reachability, and an all-path post-pass for resolved entrypoint paths. Ambiguous dynamic calls remain unresolved rather than being guessed.

## AS-AUDIT-001 - Unaudited mutation boundary

A mutation boundary was detected and the active evidence layers could not establish semantic AuditSpec evidence for the known path to that mutation.

- Severity: `warning`
- Typical confidence: `medium`
- Desired remediation: emit a semantic AuditSpec event at the service/domain boundary that owns the mutation.

The finding is still bounded by active adapters. Unknown dynamic or remote paths are not proof of absence.

## AS-AUDIT-002 - Alternate reachable path lacks audit evidence

Multiple entrypoint-to-mutation paths were statically resolved. At least one path contains semantic audit evidence and at least one alternate path does not.

- Severity: `warning`
- Typical confidence: inherited from the resolved path set.
- Desired remediation: move semantic audit emission behind a boundary shared by every mutation path, or explicitly audit and test each alternate entrypoint.

This rule prevents one well-audited path from masking an alternate unaudited route, job, hook, or other entrypoint.

## AS-ATOMIC-001 - Mutation and audit not visibly atomic

A mutation and AuditSpec evidence are visible, but the adapter cannot establish a reliable shared commit boundary.

- Severity: `warning`
- Typical confidence: `low` to `medium`
- Desired remediation: couple the business mutation and durable audit write in one transaction when they share a database, or use a transactional outbox when they do not.

Frappe `frappe.db.truncate` is a special case with `certain` confidence for the rollback limitation documented by Frappe; it requires intent/completion evidence rather than a normal same-transaction claim.

## AS-ATOMIC-002 - Alternate audited path lacks transaction evidence

Every resolved entrypoint path contains semantic audit evidence, but transaction evidence is inconsistent across those paths.

- Severity: `warning`
- Typical confidence: inherited from the resolved path set.
- Desired remediation: move mutation and durable audit write behind a shared reliable commit boundary, or provide the equivalent reliable handoff on every alternate path.

This prevents one transactionally correct caller from making a weaker alternate caller look atomic.

## AS-AUTH-001 - Privileged mutation without visible authorization evidence

A privileged-looking or permission-bypassing mutation was detected and the active evidence layers could not establish an explicit authorization decision for the known path.

- Severity: `warning`
- Typical confidence: `low` to `medium`
- Desired remediation: make authorization explicit and audit the authorization decision when it is security or accountability relevant.

## AS-AUTH-002 - Alternate reachable path bypasses visible authorization

A privileged mutation has multiple statically resolved entrypoint paths. Authorization evidence is present on at least one path and absent from another.

- Severity: `warning`
- Typical confidence: inherited from the resolved path set.
- Desired remediation: put authorization at a shared boundary that dominates every privileged mutation path, or explicitly authorize and test every alternate entrypoint.

This rule is specifically designed to catch a route/job/hook bypass that a best-path analysis would hide.

## Path enumeration safety

The v0.1 reference Inspector caps all-path enumeration at 64 paths per boundary and depth 8. If enumeration is truncated, it MUST NOT optimistically claim full coverage: the boundary is downgraded to `unknown` with low confidence.

A larger or runtime-backed implementation can use stronger graph algorithms while preserving the same uncertainty principle.

## Confidence semantics

- `certain` - directly established by machine-readable evidence or known platform semantics.
- `high` - strong structured static/runtime evidence with limited ambiguity.
- `medium` - useful inference with known cross-file/dynamic limitations.
- `low` - heuristic signal that deserves review but must not be treated as a proven defect.

GitHub and CI integrations remain advisory by default and surface confidence alongside findings.
