// glossary.md of the dogfood workspace: the contract 1.4 seed terms plus the
// terms that Part 3 §2 adds. One term, one meaning.
import type { GlossaryTerm } from "@/gen/types";

export function seedGlossary(): GlossaryTerm[] {
  return [
    {
      term: "workspace",
      kind: "noun",
      means:
        "The git repo that holds `workflow.toml`, `issues/` and `library/`. One `wf serve` serves one workspace.",
      avoid: ["vault"],
      see: ["group", "library item"],
    },
    {
      term: "group",
      kind: "noun",
      means:
        "A folder under `issues/` that holds issues or other groups. A folder without `_group.md` is an implicit group.",
      avoid: ["epic"],
      see: ["issue"],
    },
    {
      term: "issue",
      kind: "noun",
      means: "A folder that contains `goal.md`. The unit of work on the board.",
      avoid: ["ticket", "card", "story"],
      see: ["group", "task"],
    },
    {
      term: "entry",
      kind: "noun",
      means:
        "One dated, authored H2 block in `changes.md`, `decisions.md` or `learnings.md`, with a stable ID.",
      avoid: ["log item"],
      see: ["change", "decision", "learning"],
    },
    {
      term: "change",
      kind: "noun",
      means: "An entry in `changes.md` (`C-xxxxx`). Past tense, one change, with evidence.",
      avoid: [],
      see: ["entry"],
    },
    {
      term: "decision",
      kind: "noun",
      means:
        "An ADR-style entry in `decisions.md` (`D-xxxxx`): proposed, accepted or rejected. Superseded is derived.",
      avoid: ["ruling"],
      see: ["entry"],
    },
    {
      term: "learning",
      kind: "noun",
      means: "An entry in `learnings.md` (`L-xxxxx`): a rule first, then the evidence.",
      avoid: ["lesson", "insight", "takeaway"],
      see: ["promote"],
    },
    {
      term: "criterion",
      kind: "noun",
      means:
        "A success criterion `SC-n` in `goal.md`, written as an EARS sentence. States: open, claimed, verified.",
      avoid: ["acceptance item", "AC"],
      see: ["task"],
    },
    {
      term: "task",
      kind: "noun",
      means: "A `### T-n: <title>` unit of work in `plan.md`, sized for one agent context window.",
      avoid: ["subtask", "work item"],
      see: ["lane", "lease", "ready task"],
    },
    {
      term: "lane",
      kind: "noun",
      means:
        "A named stream of tasks in `plan.md` (`lane:`, default `main`). Different lanes run in parallel on different agents.",
      avoid: ["workstream"],
      see: ["task"],
    },
    {
      term: "lease",
      kind: "noun",
      means:
        "A time-limited claim: `claimed_by` plus `lease_until`. It expires after 60 minutes without a heartbeat.",
      avoid: ["reservation", "booking"],
      see: ["coordinator", "ready task"],
    },
    {
      term: "coordinator",
      kind: "noun",
      means:
        "The one author that writes `goal.md`, `plan.md` and `current_state.md` of an issue. Recorded as `claimed_by` in `goal.md`.",
      avoid: ["lead agent"],
      see: ["lease", "author"],
    },
    {
      term: "ready task",
      kind: "noun",
      means:
        "A task with `status: todo`, every `depends_on` task done, no live lease, and `owns` globs that overlap no live lease.",
      avoid: ["unblocked task"],
      see: ["task", "lease"],
    },
    {
      term: "author",
      kind: "noun",
      means:
        "A human or an agent that writes workspace files, named by an `@handle` and listed in `authors.md`.",
      avoid: ["contributor"],
      see: ["coordinator"],
    },
    {
      term: "library item",
      kind: "noun",
      means:
        "A `library/<kind>s/<slug>.md` file (`lib-xxxxx`): a pattern, playbook, gotcha or decision. Status: draft, reviewed, retired.",
      avoid: ["wiki page", "knowledge article"],
      see: ["promote"],
    },
    {
      term: "promote",
      kind: "verb",
      means:
        "Copy a learning or decision into the library as a draft library item with a `source:` backlink.",
      avoid: ["publish", "upstream"],
      see: ["library item", "learning"],
    },
    {
      term: "append",
      kind: "verb",
      means: "Add an entry at the end of a log file through `wf append`, under the lock.",
      avoid: [],
      see: ["entry"],
    },
    {
      term: "archify block",
      kind: "noun",
      means:
        "A fenced code block with the info string `archify <type>` whose body is an archify JSON candidate.",
      avoid: ["chart block"],
      see: [],
    },
    {
      term: "needs-you request",
      kind: "noun",
      means:
        "A `Q-xxxxx` checklist item in `## Needs you` of `current_state.md`: a question, approval or input for a named author.",
      avoid: ["ping", "nudge"],
      see: ["author"],
    },
    {
      term: "wf_format",
      kind: "noun",
      means:
        "The integer version of the file format, set in `workflow.toml` and in every `--json` output.",
      avoid: [],
      see: [],
    },
    {
      term: "anchor",
      kind: "noun",
      means:
        "A stable ID that addresses one editable element in a file: `status`, `SC-2`, `T-3`, `T-3.2`, `Q-4m2pz` or an entry ID.",
      avoid: ["locator"],
      see: ["rev"],
    },
    {
      term: "rev",
      kind: "noun",
      means:
        "A content revision: a blake3 hash of a file, or the counter of the latest workspace snapshot. Sent as `base_rev` with every op.",
      avoid: [],
      see: ["anchor"],
    },
  ];
}
