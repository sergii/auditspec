# Agent instructions

- Treat `SPEC.md` and `schema/audit-event.schema.json` as the source of truth for v0.1.
- Do not introduce storage, transport, or framework assumptions into the core schema without a profile or extension point.
- Preserve backward compatibility within a tagged spec version.
- Every schema change requires valid and invalid conformance fixtures.
- Never add examples containing real credentials, secrets, personal data, or production identifiers.
- Prefer small, reviewable changes and explain normative changes in the pull request.
