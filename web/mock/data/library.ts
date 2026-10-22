// library/ of the dogfood workspace: items of every kind and status. Sources point
// at real entries in the mock issues, so "In library ↗" and backlinks resolve.
import type { LibrarySrc } from "../source";
import { dateIn } from "../time";

export function seedLibrary(): LibrarySrc[] {
  return [
    {
      id: "lib-4tz7c",
      slug: "notify-macos-rescan-subtrees",
      title: "Rescan subtrees instead of trusting notify on macOS",
      kind: "gotcha",
      description:
        "Use when a file watcher on macOS must follow renamed or deleted folders. Treat each event as a dirty hint and rescan.",
      status: "reviewed",
      tags: ["notify", "macos", "watcher"],
      applies_to: ["crates/*/src/watch.rs", "notify", "fsevents"],
      source: ["[[wf-3k9x2#L-2gk7r]]", "[[wf-3k9x2#C-5wq7k]]"],
      authors: ["codex", "claude-opus"],
      reviewed_by: "shruti",
      created: dateIn(-1),
      last_reviewed: dateIn(-1),
      review_after: dateIn(179),
      sections: [
        {
          heading: "Symptom",
          body_md:
            "After a folder rename, the watcher reports the new path. The old path stays in the index. A test that renames an issue folder fails.",
        },
        {
          heading: "Cause",
          body_md:
            "FSEvents merges the events of one folder. notify then sends no remove event for the old path, and notify 9.0-rc sends `Remove(Any)` without it.",
        },
        {
          heading: "Fix",
          body_md:
            "1. Treat each event as a dirty hint for its path.\n2. Map the path to its nearest existing ancestor.\n3. Rescan that subtree and compare the files by blake3 hash.",
        },
        {
          heading: "Evidence",
          body_md:
            "- [[wf-3k9x2#C-5wq7k]]: `rename_folder` failed with notify 9.0-rc.\n- [[wf-3k9x2#C-h6r3n]]: `rename_folder` passes on notify 8.2 with the rescan.",
        },
      ],
    },
    {
      id: "lib-8w3fd",
      slug: "suppress-watcher-echoes",
      title: "Suppress watcher echoes by content hash",
      kind: "pattern",
      description:
        "Use when a process both writes files and watches them. Record the hash of each write and drop the echo event.",
      status: "reviewed",
      tags: ["watcher", "hashing", "write-back"],
      applies_to: ["crates/wf-index/src/watch.rs", "crates/wf-edit/**"],
      source: ["[[wf-7p4dn#L-7hx2d]]"],
      authors: ["codex"],
      reviewed_by: "mudit",
      created: dateIn(-21),
      last_reviewed: dateIn(-20),
      review_after: dateIn(160),
      sections: [
        {
          heading: "Rule",
          body_md:
            "Store the blake3 hash of every file you write. When the watcher reports that file, compare the hash on disk with the stored hash. Drop the event when they match.",
        },
        {
          heading: "When to use",
          body_md:
            "A daemon that writes workspace files and also rebuilds its index from watcher events.",
        },
        {
          heading: "Example",
          body_md:
            "`wf-edit` writes `goal.md` and records `blake3(bytes)`. The watcher event for `goal.md` arrives 40 ms later. The hashes match, so the index skips the rescan.",
        },
        {
          heading: "Evidence",
          body_md: "- [[wf-7p4dn#L-7hx2d]]: the echo doubled every delta before the hash check.",
        },
      ],
    },
    {
      id: "lib-2hq6n",
      slug: "splice-one-value-span",
      title: "Splice one value span; never re-serialize frontmatter",
      kind: "pattern",
      description:
        "Use when a tool must change one frontmatter value in a file that humans also edit. Keep comments, order and quoting.",
      status: "reviewed",
      tags: ["yaml", "write-back", "frontmatter"],
      applies_to: ["crates/wf-edit/**"],
      source: ["[[wf-9tq4e#D-3qv8n]]"],
      authors: ["codex", "mudit"],
      reviewed_by: "mudit",
      created: dateIn(-75),
      last_reviewed: dateIn(-74),
      review_after: dateIn(-5),
      sections: [
        {
          heading: "Rule",
          body_md:
            "Parse the frontmatter with spans. Replace only the bytes of the target value. Write the file with an atomic rename.",
        },
        {
          heading: "When to use",
          body_md: "Any write-back to `goal.md`, `plan.md` or a library item.",
        },
        {
          heading: "Example",
          body_md:
            "`wf move wf-3k9x2 review` replaces the 11 bytes of `in_progress` and leaves the rest of the file byte-identical.",
        },
        {
          heading: "Evidence",
          body_md: "- [[wf-9tq4e#D-3qv8n]]: a round-trip serializer dropped YAML comments.",
        },
      ],
    },
    {
      id: "lib-6pm4c",
      slug: "resume-from-handoff-bundle",
      title: "Resume an issue from the handoff bundle",
      kind: "playbook",
      description:
        "Use when you start a fresh session on an issue that another agent worked on. Read the bundle, not the whole folder.",
      status: "reviewed",
      tags: ["handoff", "context", "session"],
      applies_to: ["resume-issue"],
      source: ["[[wf-b1d7v#L-5vz3k]]"],
      authors: ["claude-opus"],
      reviewed_by: "shruti",
      created: dateIn(-30),
      last_reviewed: dateIn(-12),
      review_after: dateIn(150),
      sections: [
        {
          heading: "Overview",
          body_md:
            "A fresh session reads `wf context` first. The bundle holds the current state, the open criteria, the ready tasks and the last 5 changes within 6000 tokens.",
        },
        {
          heading: "Procedure",
          body_md:
            "1. Run `wf context <issue>`.\n2. Read `## Needs you` and stop if a blocking request is open.\n3. Run `wf next --issue <issue> --claim`.\n4. Read the brief of the claimed task.\n5. Read the files in `owns` only.",
        },
        {
          heading: "Done when",
          body_md: "You hold one live lease and you can name the next step of `current_state.md`.",
        },
        {
          heading: "Forbidden",
          body_md:
            "- Reading every file of the issue folder.\n- Editing a file that another live lease owns.",
        },
      ],
    },
    {
      id: "lib-9vk2w",
      slug: "quote-handles-in-yaml",
      title: "Quote handles in YAML frontmatter",
      kind: "gotcha",
      description:
        "Use when you write `owner`, `claimed_by` or `authors` in frontmatter. A bare `@handle` breaks the YAML.",
      status: "reviewed",
      tags: ["yaml", "frontmatter", "authors"],
      applies_to: ["goal.md", "plan.md", "current_state.md"],
      source: ["[[wf-m3tq8#L-4dz9w]]"],
      authors: ["codex"],
      reviewed_by: "shruti",
      created: dateIn(-9),
      last_reviewed: dateIn(-8),
      review_after: dateIn(171),
      sections: [
        {
          heading: "Symptom",
          body_md:
            "`wf lint` reports F001 on `owner: @shruti`. The board shows the issue with a red lint dot.",
        },
        {
          heading: "Cause",
          body_md: "`@` is a reserved indicator in YAML. A plain scalar cannot start with it.",
        },
        { heading: "Fix", body_md: 'Quote the handle: `owner: "@shruti"`.' },
        {
          heading: "Evidence",
          body_md: "- [[wf-m3tq8#L-4dz9w]]: three goal.md files broke the same way in one day.",
        },
      ],
    },
    {
      id: "lib-3fz8t",
      slug: "push-live-updates-over-sse",
      title: "Push one-way live updates over SSE",
      kind: "decision",
      description:
        "Use when a local web UI needs live updates from a daemon and sends its writes over plain HTTP.",
      status: "reviewed",
      tags: ["sse", "live", "transport"],
      applies_to: ["crates/wf-server/**", "web/src/lib/live/**"],
      source: ["[[wf-3k9x2#D-7f3k2]]"],
      authors: ["claude-opus"],
      reviewed_by: "shruti",
      created: dateIn(-1),
      last_reviewed: dateIn(-1),
      review_after: dateIn(179),
      sections: [
        {
          heading: "Decision",
          body_md: "Push live updates over SSE. Send every write through `POST /api/ops`.",
        },
        {
          heading: "Because",
          body_md: "Data flows one way. SSE reconnects and replays with `Last-Event-ID`.",
        },
        {
          heading: "Rejected",
          body_md:
            "- WebSocket: two-way, more code.\n- Polling every 2 s: misses a 2 s latency target.",
        },
        { heading: "Revisit when", body_md: "The UI needs to send updates over the live channel." },
      ],
    },
    {
      id: "lib-0rt4e",
      slug: "poll-the-snapshot",
      title: "Poll the snapshot every 2 s",
      kind: "decision",
      description: "Use when a prototype needs live-ish data and a server push is not ready yet.",
      status: "retired",
      tags: ["polling", "live"],
      applies_to: ["web/src/lib/api/**"],
      source: ["[[wf-3k9x2#D-2ab3c]]"],
      authors: ["claude-opus"],
      reviewed_by: "shruti",
      created: dateIn(-1),
      last_reviewed: dateIn(-1),
      superseded_by: "lib-3fz8t",
      sections: [
        { heading: "Decision", body_md: "Poll `GET /api/snapshot` every 2 s from each open tab." },
        { heading: "Because", body_md: "Polling needs no new server code." },
        {
          heading: "Rejected",
          body_md: "- SSE: one more route.\n- WebSocket: two-way, more code.",
        },
        {
          heading: "Revisit when",
          body_md: "A test shows latency above 2 s. It did: see [[lib-3fz8t]].",
        },
      ],
    },
    {
      id: "lib-5cw1e",
      slug: "review-promoted-items",
      title: "Review promoted items before agents read them",
      kind: "pattern",
      description:
        "Use when you promote a learning or decision. Keep it a draft until the group owner reviews it.",
      status: "draft",
      tags: ["library", "review", "promote"],
      applies_to: ["promote-to-library", "curate-library"],
      source: ["[[wf-x5hd3#L-8rk5m]]"],
      authors: ["claude-sonnet"],
      created: dateIn(0),
      review_after: dateIn(180),
      sections: [
        {
          heading: "Rule",
          body_md:
            "A promoted item starts as `draft`. Only a human review sets `reviewed`. `wf context` injects reviewed items only.",
        },
        {
          heading: "When to use",
          body_md: "Every promotion from `learnings.md` or `decisions.md`.",
        },
        {
          heading: "Example",
          body_md:
            "`wf promote wf-x5hd3#L-8rk5m --kind pattern` creates this draft and asks @shruti to review it.",
        },
        {
          heading: "Evidence",
          body_md: "- [[wf-x5hd3#L-8rk5m]]: an unreviewed gotcha sent two agents down a dead end.",
        },
      ],
    },
    {
      id: "lib-k2s7b",
      slug: "write-criteria-as-ears",
      title: "Write criteria as EARS sentences",
      kind: "playbook",
      description: "Use when you write or review `## Success criteria` in goal.md.",
      status: "draft",
      tags: ["ears", "criteria", "writing"],
      applies_to: ["goal.md", "write-goal"],
      source: ["[[wf-b1d7v#L-2pn6j]]"],
      authors: ["claude-opus"],
      created: dateIn(-2),
      review_after: dateIn(178),
      sections: [
        {
          heading: "Overview",
          body_md: "Each criterion is one EARS sentence that a command or a named human can check.",
        },
        {
          heading: "Procedure",
          body_md:
            "1. Start with the trigger: `When`, `While`, `If` or `Where`.\n2. Name the system, then write `shall`.\n3. Put a number with a unit or a backticked literal in the response.\n4. Add `verify:` with a command, or `manual`.",
        },
        { heading: "Done when", body_md: "`wf lint goal.md` reports no S07 and no S08." },
        {
          heading: "Forbidden",
          body_md: "- `should`, `fast`, `reliable` and other words that a test cannot check.",
        },
      ],
    },
    {
      id: "lib-7nq3d",
      slug: "match-synonyms-on-word-boundaries",
      title: "Match glossary synonyms on whole words",
      kind: "pattern",
      description:
        "Use when a lint rule or a search matches words from a list. Anchor each word with `\\b` and ignore case, so that `story` does not match `history`.",
      status: "draft",
      tags: ["lint", "glossary", "regex"],
      applies_to: ["crates/wf-lint/**"],
      source: ["[[wf-9gr4k#L-3nz8w]]"],
      authors: ["claude-sonnet"],
      created: dateIn(0),
      review_after: dateIn(180),
      sections: [
        {
          heading: "Rule",
          body_md:
            "Match each avoided word with `\\b` anchors and ignore case. Mask code spans, fenced blocks and link targets before the match.",
        },
        {
          heading: "When to use",
          body_md: "Any rule that flags words from a list, such as S06 and S09.",
        },
        {
          heading: "Example",
          body_md:
            "S09 flags `story` in `a user story` and skips it in `history`. It skips `ticket` inside the code span `fix/ticket-links`.",
        },
        {
          heading: "Evidence",
          body_md:
            "- [[wf-9gr4k#L-3nz8w]]: the first version matched `story` inside `history` on the dogfood workspace.",
        },
      ],
    },
  ];
}
