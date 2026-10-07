# AuditSpec v0.2 release readiness

Status: release-candidate stabilization

Target repository release: `v0.2.0`

Core event contract: `spec_version: "0.1"` remains unchanged.

See `docs/versioning.md` before interpreting any version number in this repository.

## Release thesis

v0.2 is primarily an executable-assurance and extension-boundary release.

It does not introduce a new Core audit-event version.

The release hardens the architecture around Core, expands framework/runtime evidence, and adds a substantial experimental identity/agent-authorization research stack while keeping its protocol boundaries explicit.

## Release inventory

### Core and compatibility

- Core `SPEC.md` remains AuditSpec v0.1.
- Core audit-event schema remains `/schema/0.1/audit-event.schema.json`.
- No Core producer is required to emit `spec_version: "0.2"`.
- Delivery identity remains `(source, id)`.
- Authorization decision and execution result remain separate facts.
- Evidence trust remains fact-scoped.

### Extension architecture

- framework/runtime adapters are separated from Inspector plugins;
- Inspector Core is framework-neutral;
- source-language scanning and framework projection are separate boundaries;
- extension framework identity is open rather than a closed Core enum;
- unsupported analysis fails toward unresolved/unknown.

### Inspector and assurance

- richer Assurance Graph and all-path evaluation;
- graph/topology diffs and stable finding fingerprints;
- remediation planning and verification;
- plugin architecture for Rails and Frappe;
- deeper Rails/Frappe source resolution;
- conservative uncertainty and depth/cycle handling;
- focused mutation testing for assurance semantics.

### Runtime corroboration

- runtime evidence record and observation-scope contracts;
- runtime producer registry;
- OpenTelemetry, authorization-decision, database-receipt, and delivery-receipt reference producers;
- corroboration query/diff semantics;
- explicit producer authority boundaries.

### Identity, agent, and mandate research

Experimental TypeScript reference APIs and research mappings now cover:

- RFC 8693 actor/delegation projection;
- RFC 9421 HTTP Message Signature evidence;
- RFC 9449 DPoP evidence;
- cross-spec agent-chain information-loss fixtures;
- monotonic assurance attenuation and identity-laundering prevention;
- deterministic human-mandate evaluation;
- RFC 8785 + SHA-256 + Ed25519 signed mandate proofs;
- AAE -02 mandate-binding projection;
- Intent Token -02 mandate-binding projection;
- end-to-end request/delegation/mandate/proof/execution composition.

These are deliberately not additions to AuditSpec Core.

Mappings against Internet-Drafts are research profiles and MUST NOT be presented as IETF protocol conformance.

### Reliability and interoperability

- PostgreSQL atomicity/failure-injection lab;
- Rails/ActiveRecord atomicity lab;
- Frappe Bench + MariaDB atomicity lab;
- CloudEvents, OpenTelemetry, W3C PROV, OSCAL mappings;
- official pinned NIST OSCAL validation;
- TypeScript, Ruby, and Python reference conformance;
- GitHub Action and local MCP server.

## Public-surface classification

### Normative stable surface for this release line

- `SPEC.md`;
- `schema/audit-event.schema.json`;
- Core valid/invalid conformance vectors;
- normative Core behavioral requirements.

This remains Core v0.1.

### Supported non-Core release surface

- repository JSON Schemas and their explicit artifact versions;
- TypeScript/Ruby/Python reference conformance behavior;
- CLI, Inspector, GitHub Action, MCP;
- adapter/runtime-producer manifests;
- documented assurance invariants;
- runtime corroboration and mapping contracts.

These surfaces remain pre-1.0 and may version independently.

### Experimental/research surface

The following APIs are executable and tested but remain research-oriented in v0.2:

- `mapRfc8693Claims`;
- `mapRfc9421Verification`;
- `mapDpopVerification`;
- `evaluateAssuranceAttenuation`;
- `analyzeAgentChainFixture`;
- `evaluateHumanMandate`;
- `issueHumanMandateProof` / `verifyHumanMandateProof`;
- AAE / Intent Token mandate-binding profiles;
- `evaluateEndToEndMandateChain`.

They are not a promise that AuditSpec owns or replaces OAuth, JOSE, HTTP Message Signatures, DPoP, AAE, Intent Token, or any future IETF agent-authorization protocol.

## Known intentional gaps

These are not v0.2 blockers unless a release claim says otherwise:

- no new Core event version;
- no Go/Rust reference implementation yet;
- no Web Bot Auth key-discovery profile yet;
- no universal DID/key-discovery implementation;
- no network revocation client;
- no distributed replay/single-use store;
- no universal HTTP-payload-to-`MandatedAction` canonical mapper;
- no generic implementation of arbitrary deployment-specific Intent Token bounds;
- no claim that draft-based research profiles are stable standards;
- no production SaaS/cloud dependency.

## Release blockers

The v0.2.0 tag should not be cut until all of these are true:

- [ ] release-candidate branch is green in required CI;
- [ ] TypeScript reference package/server version is changed from `0.2.0-rc.1` to `0.2.0`;
- [ ] `CHANGELOG.md` v0.2.0 section is finalized with release date;
- [ ] README status no longer says release candidate;
- [ ] release-readiness script passes with final metadata;
- [ ] the v0.2 integration into `main` is green;
- [ ] final tag `v0.2.0` is created from the intended mainline commit;
- [ ] the GitHub Action is smoke-tested from the released tag/reference.

## Go/no-go criteria

The release is a GO when:

1. all required CI workflows are green;
2. Core version boundaries are unchanged and documented;
3. no experimental identity/mandate surface is described as Core or protocol conformance;
4. required source restrictions fail closed in mandate adapters;
5. end-to-end cross-layer bindings remain explicit;
6. release metadata is internally consistent;
7. the changelog accurately separates stable Core compatibility from new non-Core/experimental surfaces.

The release is a NO-GO if a change:

- silently requires producers to emit Core `spec_version: "0.2"`;
- widens authorization by dropping a required source restriction;
- treats a valid signature as unlimited signer authority;
- treats adjacent valid artifacts as proof that they concern the same action;
- upgrades weak upstream identity/delegation evidence through stronger downstream producers;
- turns runtime observation or compliance mappings into universal truth/certification.
