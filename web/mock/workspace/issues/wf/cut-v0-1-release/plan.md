---
updated_at: 2026-10-21T15:00+05:30
updated_by: "@mudit"
revision: 1
---

## Approach

Build, sign, notarize and upload in one CI workflow. The diagram shows the current draft of the flow.

```archify workflow id=broken-release-flow
{
  "meta": {
    "title": "Release candidate checklist"
  },
  "nodes": [
    {
      "id": "tag",
      "label": "Tag the release candidate",
      "kind": "start"
    },
    {
      "id": "build",
      "label": "Build artifacts",
      "kind": "step"
    },
    {
      "id": "unit",
      "label": "Run unit tests",
      "kind": "step"
    },
    {
      "id": "e2e",
      "label": "Run end-to-end tests",
      "kind": "step"
    },
    {
      "id": "gate",
      "label": "All checks green?",
      "kind": "decision"
    },
    {
      "id": "approve",
      "label": "Product owner approves",
      "kind": "step"
    },
    {
      "id": "staging",
      "label": "Deploy to staging",
      "kind": "step"
    },
    {
      "id": "smoke",
      "label": "Smoke test staging",
      "kind": "step"
    },
    {
      "id": "notes",
      "kind": "step"
    },
    {
      "id": "publish",
      "label": "Publish the release",
      "kind": "end"
    },
    {
      "id": "rollback",
      "label": "Roll back staging",
      "kind": "end"
    }
  ],
  "edges": [
    {
      "from": "tag",
      "to": "build"
    },
    {
      "from": "build",
      "to": "unit"
    },
    {
      "from": "build",
      "to": "e2e"
    },
    {
      "from": "unit",
      "to": "gate"
    },
    {
      "from": "e2e",
      "to": "gate"
    },
    {
      "from": "gate",
      "to": "approve",
      "label": "yes"
    },
    {
      "from": "approve",
      "to": "staging"
    },
    {
      "from": "staging",
      "to": "deploy-prod",
      "label": "promote"
    },
    {
      "from": "staging",
      "to": "smoke"
    },
    {
      "from": "smoke",
      "to": "notes",
      "label": "passes"
    },
    {
      "from": "notes",
      "to": "publish"
    },
    {
      "from": "smoke",
      "to": "rollback",
      "label": "fails"
    }
  ]
}
```

## Assumptions

- A1: Notarization takes under 15 min. [open]

## Phase 1: Prepare

### T-1: Write the release checklist
- status: todo
- lane: release
- owns: `docs/release/checklist.md`
- satisfies: SC-2
- assignee: @mudit
- verify: manual

List the steps from the tag to the Homebrew pull request. Name the owner of each step.

## Phase 2: Build

### T-2: Build signed binaries in CI
- status: todo
- lane: release
- depends_on: T-1
- owns: `.github/workflows/release.yml`
- satisfies: SC-1
- assignee: role:backend
- verify: `just release-dry-run`

Build for `aarch64-apple-darwin`, `x86_64-apple-darwin` and `x86_64-unknown-linux-gnu`. Sign and notarize the macOS builds.

### T-3: Write the Homebrew formula
- status: todo
- lane: release
- depends_on: T-2
- owns: `packaging/homebrew/wf.rb`
- satisfies: SC-3
- assignee: @mudit
- verify: manual

Install `wf` and `wf-server` from the release archive. Pin the SHA-256 of each archive.
