# AuditSpec Inspector rules

AuditSpec findings are evidence-backed assessment results, not compliance verdicts. A finding identifies the rule, location, evidence, severity, and confidence used to reach the conclusion.

The v0.1 Rails and Frappe adapters are AST-assisted through ast-grep/Tree-sitter. AST evidence confirms that a source construct is an executable call node rather than matching text inside a comment or string. Cross-file reachability, runtime execution, dynamic dispatch and transaction propagation are still outside the proof boundary of the current adapters.

## AS-AUDIT-001 - Unaudited mutation boundary

An AST-confirmed mutation call was detected and no visible AuditSpec emission call was found in the same source file.

- Severity: `warning`
- Initial finding confidence: `medium`
- Mutation-boundary evidence confidence: typically `high`
- Desired remediation: emit a semantic AuditSpec event at the service/domain boundary that owns the mutation.

This rule still cannot prove absence across a different service object, dynamic dispatch or a remote service. A future call-graph/runtime adapter may strengthen or refute the finding.

## AS-ATOMIC-001 - Mutation and audit not visibly atomic

An AST-confirmed mutation and AuditSpec emission are visible, but the adapter cannot establish a reliable shared commit boundary.

- Severity: `warning`
- Typical confidence: `low`
- Desired remediation: couple the business mutation and durable audit write in one transaction when they share a database, or use a transactional outbox when they do not.

Frappe `frappe.db.truncate` is a special case with `certain` confidence for the rollback limitation documented by Frappe; it requires intent/completion evidence rather than a normal same-transaction claim.

## AS-AUTH-001 - Privileged mutation without visible authorization evidence

An AST-confirmed mutation occurs on a privileged-looking or permission-bypassing surface, but no known authorization call is visible in the same source file.

- Severity: `warning`
- Typical confidence: `low` to `medium`
- Desired remediation: make the authorization boundary explicit and audit the authorization decision when it is security or accountability relevant.

This remains a discovery signal, not proof that authorization is absent elsewhere in the call chain.

## Confidence semantics

- `certain` - directly established by machine-readable evidence or known platform semantics.
- `high` - strong structured static/runtime evidence with limited ambiguity.
- `medium` - useful inference with known cross-file/dynamic limitations.
- `low` - heuristic signal that deserves review but must not be treated as a proven defect.

GitHub and CI integrations remain advisory by default and surface confidence alongside findings.
