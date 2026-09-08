# References and prior art

AuditSpec is independently implemented and informed by established work in audit logging, provenance, event standards, observability, security, agent accountability, static analysis, and machine-readable compliance.

## Product audit logging

- auditlog.dev by Maximilian Kaske / OpenStatus - semantic product audit model, actors, delegation, before/after changes, denied events, service-layer emission and transactional recording.
- OpenStatus audit-log implementation - practical service-layer and same-transaction implementation patterns.
- WorkOS Audit Logs - product-facing audit schema, target collections, schema evolution and delivery patterns.
- WorkOS agent audit work - agent sessions/tool calls, payload digests/previews, and the distinction between endpoint self-reporting and stronger server-side evidence.
- Retraced - open-source audit-log backend prior art; AuditSpec intentionally does not try to become another hosted/storage backend in Core.

## Security and logging guidance

- OWASP Logging Cheat Sheet - application-level event context, results, interaction identifiers, sensitive-data handling and log protection.
- OWASP ASVS logging requirements - event metadata, timestamps and security logging expectations.

## Event and observability standards

- CloudEvents - portable event envelope and `(source, id)` event identity model.
- OpenTelemetry Logs data model - timestamp, observed timestamp, trace/span correlation, resource and instrumentation context.
- W3C Trace Context - interoperable trace and parent/span identifiers.

## Provenance

- W3C PROV / PROV-O - formal provenance model for Agent, Activity, Entity, association and `actedOnBehalfOf` delegation relationships.
- JSON-LD - potential representation layer for future provenance mappings.
- OpenLineage - prior art for a small core plus versioned, schema-addressed facets/extensions.

## Static analysis

- Tree-sitter - incremental concrete syntax tree parsers used to distinguish executable syntax from raw text.
- ast-grep - structural search API built on Tree-sitter. The TypeScript reference Inspector uses ast-grep only as an implementation dependency; AuditSpec does not require a particular parser or analysis engine.

## Security ecosystems and compliance

- OCSF - vendor-neutral security event schema framework; candidate future mapping for SIEM/security ecosystems.
- Elastic Common Schema (ECS) - candidate mapping for common security/observability fields.
- NIST OSCAL - machine-readable control catalogs, profiles, system implementations, assessment plans/results, observations, findings, risks, evidence and remediation.

## Integrity and transparency

- RFC 8785 JSON Canonicalization Scheme (JCS) - candidate canonical JSON representation for deterministic hashing/signing.
- SCITT architecture/receipts - candidate future integrity/transparency profile for signed statements and receipts.

## Framework-level history

- Rails PaperTrail and Audited - model history/versioning comparison; useful but semantically different from AuditSpec domain events.
- Frappe / ERPNext Version and Access Log - native low-level history that should coexist with semantic AuditSpec events rather than be replaced.

## Licensing and attribution

AuditSpec must remain independently implemented. Do not copy source code, prose, fixtures, or UI from prior-art projects unless their licenses and attribution obligations are explicitly satisfied.

Tree-sitter and ast-grep are implementation dependencies under permissive licenses; language packages should retain their own dependency notices when the reference package is distributed.
