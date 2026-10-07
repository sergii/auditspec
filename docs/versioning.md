# AuditSpec versioning

AuditSpec has several versioned surfaces that intentionally move at different rates.

The repository release version is not the same thing as the Core event `spec_version`.

## Version planes

Current `main` development state is declared in `release/metadata.json`.

| Plane | Current value | Meaning |
| --- | --- | --- |
| Latest tagged release | `v0.2.0` | Latest immutable repository release/tag. |
| Main development line | `v0.3` | Active repository development line on `main`. |
| Target next release | `v0.3.0` | Planned repository release for the active development line. |
| TypeScript reference package | `0.3.0-dev.1` | Private implementation development version. |
| MCP server implementation | `0.3.0-dev.1` | Server implementation version reported to MCP clients. |
| Core audit event | `spec_version: "0.1"` | Normative semantic contract for AuditSpec Core events. |
| Core schema URI | `/schema/0.1/audit-event.schema.json` | Immutable Core schema family/version. |
| Assessment/report schemas | currently `0.1` families | Independently versioned non-Core contracts. |
| Inspector/adapters/plugins | independently versioned | Implementation capability versions, not Core versions. |
| External drafts/standards | exact RFC or draft revision | Prior-art/source revision used by a mapping/profile. |

## Development and release versions

The active repository line and the latest tagged release are deliberately different while development is in progress:

```text
latest tagged release       v0.2.0
main development line       v0.3
next target release         v0.3.0
reference implementation    0.3.0-dev.1
Core event spec_version     0.1
```

Development implementation versions use:

```text
<target>-dev.N
```

Release candidates use:

```text
<target>-rc.N
```

A final released implementation version equals the target release version.

Advancing `0.3.0-dev.1` to another development/candidate/final version changes implementation/repository metadata only. It does not change Core unless AuditSpec explicitly versions the normative Core contract.

## Why v0.3 can still use Core spec_version 0.1

The v0.3 development line adds adoption, conformance, package-boundary, and API-stability capabilities without redefining the Core event.

Examples include:

- first-time implementer quickstart commands;
- implementer-owned corpus conformance;
- stable/experimental/internal TypeScript API classification;
- a packed-package external consumer sample;
- release-shape/package-boundary validation.

Those surfaces consume or distribute Core. They do not change the meaning of:

```json
{
  "spec_version": "0.1"
}
```

Changing the repository or implementation version MUST NOT be interpreted as a silent Core schema upgrade.

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

For current `main` development:

```text
TypeScript reference package  0.3.0-dev.1
MCP server implementation     0.3.0-dev.1
Core event spec_version       0.1
```

The latest tagged release remains `v0.2.0`.

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


## Library API stability rule

Repository/package version and individual library API stability are separate dimensions.

The TypeScript reference classifies imports as:

```text
stable        @auditspec/reference-typescript
experimental @auditspec/reference-typescript/experimental
internal     not exported as a package subpath
```

The machine-readable classification is `implementations/typescript/api-surface.json`.

A stable root symbol is an intentional compatibility surface for external implementers. Experimental APIs may change incompatibly across `0.x` releases. Internal source/build files have no import compatibility promise.

Adding a source module does not make it public. The API-surface CI gate requires every TypeScript module to be classified and prevents the stable root from using wildcard exports.

See `docs/api-stability.md`.
