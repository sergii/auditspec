# AuditSpec implementation skill

Use this skill when adding AuditSpec to an application.

1. Enumerate meaningful mutation and authorization boundaries.
2. Identify the immediate actor and any delegated principal.
3. Choose a stable semantic action name.
4. Identify the target and affected user when applicable.
5. Record `allowed` and meaningful `denied` outcomes.
6. Capture before/after snapshots only when they add value.
7. Remove secrets before persistence.
8. Propagate request, trace, session, and tool-call correlation identifiers.
9. Mark evidence trust based on the real producer boundary.
10. Make successful mutation + audit persistence atomic when possible.
11. Add conformance and integration tests.
12. Report uncovered write paths as defects.
