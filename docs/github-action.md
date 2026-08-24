# AuditSpec GitHub Action

The repository includes an advisory composite GitHub Action that runs AuditSpec Inspector entirely inside the GitHub Actions runner.

## Usage

```yaml
name: AuditSpec

on:
  pull_request:

permissions:
  contents: read

jobs:
  auditspec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: sergii/auditspec@v0.1
        with:
          baseline: auto
```

During the working-draft phase, pin to an explicit commit or branch only for experimentation. A stable tag should be used after the first release.

## Pull request behavior

With `baseline: auto`, the action:

1. Inspects the checked-out pull request revision.
2. Fetches `GITHUB_BASE_REF` when available.
3. Creates a temporary detached worktree for the base revision.
4. Inspects the base revision.
5. Compares findings by stable finding fingerprint and mutation boundaries by stable boundary fingerprint.
6. Emits inline GitHub `warning` annotations for **new findings only**.
7. Detects boundaries that became newly statically reachable through a route, job, hook, whitelist, or other resolved entrypoint.
8. Emits an additional reachability warning only when that newly reachable boundary is not fully `covered` and a new finding does not already explain the same boundary.
9. Writes finding counts, audit-coverage delta, reachability counts, and newly reachable boundaries to the Job Summary.
10. Exits successfully even when findings or reachability warnings exist.

This implements two independent ratchets:

```text
AUDIT GAP RATCHET
existing debt -> visible in summary
new debt      -> inline warning
resolved debt -> positive diff

REACHABILITY RATCHET
existing internal mutation -> baseline
new route/job/hook exposes it
                         -> warning when audit status is partial/uncovered
covered exposure         -> summary only

merge -> not blocked by AuditSpec
```

The second ratchet matters because a pull request can increase risk without changing the mutation itself. Adding an HTTP route, background job dispatch, Frappe hook, or other entrypoint can make previously internal code reachable. A line-based linter would usually see no new mutation, while AuditSpec can compare the same boundary fingerprint across base/head assessments.

`no_longer_statically_reachable` means the head assessment can no longer prove the previous static entrypoint path. It does **not** mean the code is unreachable at runtime.

Set `baseline: off` to inspect only the current checkout. In that mode all current findings are surfaced and there is no reachability diff.

## Outputs

The action exposes:

- `report-path` - generated head Assessment Report JSON
- `diff-path` - generated Assessment Diff JSON when a baseline was available

The Assessment Diff includes `new_findings`, `resolved_findings`, audit coverage delta, and a reachability section with `newly_reachable`, `no_longer_statically_reachable`, and reachable-boundary counts.

The files remain on the runner. A workflow may explicitly upload them as artifacts if desired.

## Privacy and trust

The initial action does not send source code or Assessment Reports to an AuditSpec service. Source inspection, comparison, graph construction, and annotations run locally on the GitHub-hosted or self-hosted runner.

The composite action currently installs the repository-local TypeScript reference dependencies at runtime. A later release may ship a prebuilt or containerized distribution for faster startup and stronger supply-chain pinning.

## Non-blocking by default

AuditSpec findings are not automatically vulnerabilities or compliance failures. Heuristic adapters preserve confidence and uncertainty, so the default action uses warnings rather than failing the workflow.

Static reachability is also evidence, not runtime proof. The action therefore reports newly reachable paths without claiming that they executed in production.

Future policy modes may allow projects to fail only on configured classes of new high-confidence findings or uncovered newly reachable privileged boundaries, while keeping AuditSpec Core and the Assessment Report policy-neutral.
