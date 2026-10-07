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

## Identity, authorization, and delegation

- OAuth 2.0 Token Exchange (RFC 8693) - standardized token exchange for impersonation and delegation, including the `act` current-actor claim, nested actor history, `may_act` authorized-actor claim, and scope/audience constraints. AuditSpec treats this as prior art and mapping input rather than copying OAuth token semantics into Core.
- OAuth Identity and Authorization Chaining Across Domains (draft-ietf-oauth-identity-chaining) - preserves identity and authorization information across OAuth trust-domain boundaries by combining Token Exchange and JWT authorization grants.
- Transaction Tokens (draft-ietf-oauth-transaction-tokens) - short-lived signed transaction context carrying user/workload identity and authorization context through a call chain inside a trust domain; explicitly distinct from workload authentication credentials and OAuth access tokens.
- Transaction Tokens For Agents (draft-oauth-transaction-tokens-for-agents) - agent-focused extension using `act` for the acting agent and `sub` for the represented principal in agent-based workloads.
- Verifiable Human Mandates for Autonomous Agent Actions (draft-yossif-agent-mandate-problem) - emerging problem statement around proving that a concrete autonomous-agent action remained within a human-authorized intent/mandate.

## Request authenticity and proof of possession

- HTTP Message Signatures (RFC 9421) - standard mechanism for signing or MAC-protecting selected HTTP message components. Useful evidence that a holder of particular key material signed a particular request, but it does not itself define user/agent delegation semantics.
- OAuth 2.0 Demonstrating Proof of Possession (DPoP, RFC 9449) - sender-constrains OAuth tokens to a key and proves possession per request; useful for preventing bearer-token replay but not, by itself, an actor/delegation model.
- HTTP Message Signatures for automated traffic / Web Bot Auth (draft-ietf-webbotauth-httpsig-protocol) - emerging IETF work for cryptographically identifying automated HTTP clients using RFC 9421, a `Signature-Agent` identity anchor, and discoverable public keys. Its current scope explicitly separates bot identity from authorization, delegation, and user consent.

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

## Practitioner discussions

- David Cramer, "is there an open identity spec i should adopt in Junior?" discussion thread, 7 October 2026 - https://x.com/zeeg/status/2107579942221607324 - practical motivation for a shared, interoperable way to attach the true actor to outbound agent requests, and a useful distinction between request signing, agent identity, and the user on whose behalf an agent acts.

## Licensing and attribution

AuditSpec must remain independently implemented. Do not copy source code, prose, fixtures, or UI from prior-art projects unless their licenses and attribution obligations are explicitly satisfied.

Tree-sitter and ast-grep are implementation dependencies under permissive licenses; language packages should retain their own dependency notices when the reference package is distributed.
