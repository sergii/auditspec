# AuditSpec versioning

AuditSpec has several versioned surfaces that intentionally move at different rates.

The repository release version is not the same thing as the Core event `spec_version`.

## Version planes

| Plane | v0.2 release-candidate value | Meaning |
| --- | --- | --- |
| Repository release | `v0.2.0` target | The version of the repository release/tag as a whole. |
| TypeScript reference package | `0.2.0-rc.1` | The implementation/release-line version of the private TypeScript reference package. |
| MCP server implementation | `0.2.0-rc.1` | The server implementation version reported to MCP clients. |
| Core audit event | `spec_version: "0.1"` | The normative semantic contract for AuditSpec Core events. |
| Core schema URI | `/schema/0.1/audit-event.schema.json` | The immutable Core schema family/version. |
| Assessment/report schemas | currently `0.1` families | Independently versioned non-Core contracts. |
| Inspector/adapters/plugins | independently versioned | Implementation capability versions, not Core versions. |
| External drafts/standards | exact RFC or draft revision | Prior-art/source revision used by a mapping/profile. |

## Why v0.2 can still use Core spec_version 0.1

The v0.2 repository line adds substantial executable capability without redefining the Core event.

Examples include:

- framework-neutral Inspector/plugin boundaries;
- deeper Rails and Frappe source analysis;
- runtime evidence producers and corroboration;
- assurance attenuation;
- RFC 8693 identity/delegation projection;
- RFC 9421 and DPoP request-evidence projection;
- human-mandate evaluation and signed mandate proof;
- AAE and Intent Token research profiles;
- end-to-end mandate-chain composition.

Those surfaces consume or complement Core. They do not require changing the meaning of:

```json
{
  "spec_version": "0.1"
}
```

Changing the repository release number therefore MUST NOT be interpreted as a silent Core schema upgrade.

## Core version rule

A new Core `spec_version` is required only when AuditSpec intentionally versions the normative event contract.

Examples that would justify a future Core version include:

- adding/removing a required Core field;
- changing the meaning of an existing Core field;
- changing a Core enum incompatibly;
- changing normative Core behavior in a way that existing conforming producers/consumers cannot safely treat as the same contract.

Adding a new optional mapping, profile, reference implementation feature, Inspector capability, runtime producer, or research adapter does not by itself require a Core version bump.

## Non-Core schema rule

Non-Core schemas are separately versioned contracts.

A repository release may add a new non-Core schema whose own contract version begins at `0.1`.

For example, the human-mandate proof is new in the v0.2 repository line while its own statement/evaluation contract is still `0.1`.

Consumers MUST inspect the version field or immutable schema identifier of the specific artifact they consume rather than infer it from the repository tag.

## Implementation version rule

Reference implementations use package/server versions to describe the implementation build, not the Core event contract.

For the v0.2 release candidate:

```text
TypeScript reference package  0.2.0-rc.1
MCP server implementation     0.2.0-rc.1
Core event spec_version       0.1
```

The final release preparation should change the implementation package/server version from `0.2.0-rc.1` to `0.2.0` without changing Core `spec_version`.

## Research profile rule

Mappings against evolving Internet-Drafts MUST pin or name the exact draft revision they were reviewed against.

A future draft revision may change semantics even when AuditSpec itself does not change.

Therefore:

```text
AuditSpec release version
        !=
external draft revision
```

Research mappings MUST NOT claim protocol conformance unless AuditSpec actually implements the protocol's required verification behavior and that claim is explicitly documented.

## Compatibility promise for 0.x

AuditSpec is still pre-1.0.

The project should make compatibility boundaries explicit, but later `0.x` releases may contain breaking changes.

Consumers that require reproducibility should pin:

- an immutable AuditSpec release/tag or commit;
- the exact artifact/schema version they consume;
- the exact external draft/RFC revision where a research mapping depends on one.
