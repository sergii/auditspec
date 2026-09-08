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

For released use, pin the `v0.1` tag or an immutable commit. Before a tag is published, use an explicit commit for experimentation rather than relying on a moving development branch.

## Pull request behavior

With `baseline: auto`, the action:

1. Inspects the checked-out pull request revision and builds its Assurance Graph.
2. Fetches `GITHUB_BASE_REF` when available.
3. Creates a temporary detached worktree for the base revision.
4. Inspects the base revision and builds its Assurance Graph.
5. Compares findings by stable finding fingerprint and mutation boundaries by stable boundary fingerprint.
6. Compares the two Assurance Graphs by stable semantic topology identity.
7. Emits inline GitHub `warning` annotations for **new findings only**.
8. Detects boundaries that became newly statically reachable through a route, job, hook, whitelist, or other resolved entrypoint.
9. Emits an additional reachability warning only when that newly reachable boundary is not fully `covered` and a new finding does not already explain the same boundary.
10. Reports new entrypoints, framework dispatches, and entrypoint-to-mutation paths in the Job Summary without duplicating line-level warnings.
11. Exits successfully even when findings or architecture regressions exist.

This implements three related but distinct ratchets:

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

TOPOLOGY RATCHET
base Assurance Graph
       -> new entrypoint
       -> new framework dispatch
       -> new entrypoint-to-mutation path
       -> architecture change shown explicitly

merge -> not blocked by AuditSpec
```

The reachability and topology ratchets matter because a pull request can increase exposure without changing the mutation itself. Adding an HTTP route, background job dispatch, Frappe hook, or other entrypoint can make previously internal code reachable. A line-based linter would usually see no new mutation, while AuditSpec can compare both stable boundary identities and graph topology across base/head revisions.

`no_longer_statically_reachable` means the head assessment can no longer prove the previous static entrypoint path. It does **not** mean the code is unreachable at runtime.

Likewise, a removed topology path means the static graph no longer contains that resolved relationship. It is not runtime reachability proof.

Set `baseline: off` to inspect only the current checkout. In that mode all current findings are surfaced and there is no assessment, reachability, or topology diff.

## Outputs

The action exposes:

- `report-path` - generated head Assessment Report JSON
- `diff-path` - generated Assessment Diff JSON when a baseline was available
- `topology-diff-path` - generated Assurance Graph Diff JSON when a baseline was available

The Assessment Diff includes `new_findings`, `resolved_findings`, audit coverage delta, and a reachability section with `newly_reachable`, `no_longer_statically_reachable`, and reachable-boundary counts.

The Assurance Graph Diff includes new/removed entrypoints, new/removed framework dispatches, and new/removed entrypoint-to-mutation paths.

The files remain on the runner. A workflow may explicitly upload them as artifacts if desired.

## Privacy and trust

The initial action does not send source code, Assessment Reports, or Assurance Graphs to an AuditSpec service. Source inspection, graph construction, comparison, and annotations run locally on the GitHub-hosted or self-hosted runner.

The composite action currently installs the repository-local TypeScript reference dependencies at runtime. A later release may ship a prebuilt or containerized distribution for faster startup and stronger supply-chain pinning.

## Non-blocking by default

AuditSpec findings are not automatically vulnerabilities or compliance failures. Heuristic adapters preserve confidence and uncertainty, so the default action uses warnings rather than failing the workflow.

Static reachability and graph topology are also evidence, not runtime proof. The action therefore reports architecture changes without claiming that a path executed in production.

Future policy modes may allow projects to fail only on configured classes of new high-confidence findings or uncovered newly reachable privileged paths, while keeping AuditSpec Core and the machine-readable diff contracts policy-neutral.
