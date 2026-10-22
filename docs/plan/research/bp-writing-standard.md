# `wf` writing standard: "wf Plain English" (based on STE)

**Basis.** "ASE STD-100" means ASD-STE100 Simplified Technical English, Issue 9 (Jan 2025). We take these STE ideas: max 20 words per sentence in procedures and max 25 in descriptions; one instruction per sentence; procedures in the imperative; active voice (passive only when the actor is unknown); simple tenses; keep the articles; max 3 nouns in a cluster; one topic and max 6 sentences per paragraph; one word, one meaning; safety notices start with a command [W][SKY][SE]. These limits come from secondary sources. I could not read the official PDF because it sits behind a request form.

**Licensing.** The PDF is free on request, but ASD keeps the copyright ("All Rights Reserved"). The name is an EU trademark, and ASD certifies no tools [FAQ][DL]. So: do not commit the PDF or its ~900-word dictionary; write the rules in our own words; use our own term and verb lists; say "based on STE", never "STE-compliant".

## 1. Rules

| # | Rule | Bad → Good |
|---|---|---|
| R1 | One action per sentence. A plan step starts with an imperative verb. Max 20 words in steps, 25 elsewhere. | "Update the parser and add tests" → two steps |
| R2 | Use the active voice. Name the actor: `@author`, a component or a file. | "Cache was invalidated" → "The watcher clears the cache" |
| R3 | Pick the tense by file. Present for goal, current_state and library. Past for changes. Imperative for plan. | "would have been fixed" → "We fixed" |
| R4 | One term, one meaning. Use the word in `glossary.md`. | "ticket/task/card" → "issue" |
| R5 | Name exact things. Put paths, commands and IDs in backticks. Do not start an entry with "It" or "This". | "Fixed it" → "Fixed the panic in `index::reload`" |
| R6 | Max 3 nouns in a row. Split the cluster with "of", or add a glossary term. | "entry append lock path" → "path of the append lock" |
| R7 | One topic per paragraph, max 6 sentences. Use a list for 3 or more items. | |
| R8 | Make only claims you can measure: a number with a unit, a literal, or a state you can see. | "fast board" → "renders 500 cards in < 200 ms" |
| R9 | No hedges or escape clauses ("should probably", "if possible", "etc.", "TBD"). State the condition, or write an open question `Q:`. | |
| R10 | Condition first, action second. | "Restart if the port is busy" → "If port 7777 is busy, restart `wf`" |
| R11 | Put `> [!WARNING]` or `> [!CAUTION]` before the step it guards. Give the command first, then the risk. | "Stop all agents before `wf migrate`. Concurrent appends can lose entries." |
| R12 | Keep articles and verbs. Do not use contractions. | "Fix bug parser" → "Fix the bug in the parser" |
| R13 | Put the point first. A decision starts with the choice. A learning starts with the rule. Evidence comes after. | |
| R14 | Cite evidence. Changes link a commit, PR or file. Learnings link their source issue. | |

**Per-file shapes**

| File | Shape | Example |
|---|---|---|
| `goal.md` | One context paragraph, then EARS criteria (§2) | "Agents lose context between sessions. This issue adds `current_state.md`." |
| `plan.md` | Numbered imperative steps; each step can have `Done when:` | "3. Replace the poll loop in `watch.rs` with `notify`. Done when: `cargo test watch` passes." |
| `current_state.md` | Present tense, under `Now` / `Blocked by` / `Next` | "Blocked by: `archify finalize` exits 2 on `sequence`." |
| changes | `### 2026-10-22 @codex`, past tense, one change, a link | Good: "Fixed the lost update in `append_entry` (#41)." Bad: "Various fixes." |
| decisions | ADR: Decision / Because / Rejected / Revisit when | Good: "Decision: Push over SSE. Because: one-way data." Bad: "SSE is probably best for now." |
| learnings, library | Rule, then evidence. Library items drop names specific to one issue and add `applies_when:` and `source:` | "On macOS, `notify` can report one rename as two events. Debounce for 50 ms." |

## 2. EARS success criteria (`goal.md`)

Write success criteria with the EARS patterns [MAV][EARS]. Kiro uses them too [KIRO]. When an issue is not code, the "system" is the deliverable or the team.

```markdown
## Success criteria
- [ ] SC-1: The `wf` binary shall serve the dashboard on port 7777.
- [ ] SC-2: When an agent appends to `changes.md`, the board shall show the entry within 2 s.
  - Verify: `wf test e2e --append` exits 0
  - Given 3 agents append at once / When all finish / Then `changes.md` has 3 entries
- [ ] SC-3: While a write-back is pending, the board shall disable drag on that card.
- [ ] SC-4: If `goal.md` frontmatter is invalid, then the board shall show a lint warning.
- [ ] SC-5: Where `archify` is installed, the daemon shall render archify blocks.
- [ ] SC-6: The Q4 hiring report shall list every open role with an owner by 2026-11-30.
```

A criterion can have two optional children: `Verify:`, which is the SMART measure [SMART], and a `Given/When/Then` scenario [CUC].

**Parser.** It runs in the same pulldown-cmark pass and reads task items under a heading that matches `/success criteria|acceptance/i`.
1. Strip the checkbox, then the optional ID `^(SC-\d+)[:.]\s*`.
2. Strip the leading clauses in a loop with `^(while|when|if|where)\s+(.+?),\s*` (ignore case). Then strip `then\s+` if present.
3. Match the rest with `^(?:the\s+)?(.+?)\s+(shall|must)(\s+not)?\s+(.+)$` to get the system and the response.
4. Classify by keyword:
   - none: ubiquitous
   - `when`: event
   - `while`: state
   - `where`: optional
   - `if…then`: unwanted
   - 2 or more keywords: complex
   - no match: freeform (an info lint, never an error)
5. Set `measurable` when the response contains one of:
   - a number with a unit (`\d+(\.\d+)?\s*(ms|s|min|h|d|%|MB|x)\b`)
   - a date
   - a literal
   - a `Verify:` child

`Given/When/Then` children become `scenario`. The result is `Criterion { id, checked, pattern, preconditions, trigger, system, response, negated, measurable, verify, scenario, span }`, and it feeds the progress ring.

A `definition_of_done:` list in `_group.md` applies to every child issue. The board shows it as a second checklist [SG]. Plan steps must be small and testable (INVEST [INV]). `Done when:` is the test for each step.

## 3. Lint: Rust warnings vs skill guidance

All lints are warnings, and the board always shows the file.
- Lints read only pulldown-cmark Text events. They skip frontmatter, code, URLs and `archify` blocks.
- One aho-corasick automaton holds all the phrase lists.
- Each hit keeps a byte span, so the UI can underline it.
- Cost is O(n) per changed file.
- Set levels in `wf.toml [lint]`. Turn a lint off with `<!-- wf-lint-disable L06 -->`.

| ID | Check | How | Level |
|---|---|---|---|
| L01 | Sentence over 20 words (steps) or over 25 words (other text) | Sentence bounds from `unicode-segmentation` | warn |
| L02 | Paragraph over 6 sentences, or an inline series of 3+ items | Count | info |
| L03 | Passive voice | A form of *be*, up to 1 adverb, then `\w+ed` or one of ~200 irregular participles. A following "by" raises confidence [PV] | info |
| L04 | More than one instruction in a step | A listed verb, then `;`, `, then` or `and <verb>` | warn |
| L05 | Step does not start with an imperative verb | First word is not a glossary `kind: verb` | warn |
| L06 | Hedges | should probably, maybe, might, try to, as appropriate, if possible, etc., TBD, various, just | warn |
| L07 | Words you cannot measure, in a criterion | fast, better, robust, scalable, intuitive, user-friendly, efficient, adequate. Skipped if `measurable` [INC] | warn |
| L08 | Criterion is not in an EARS pattern | §2 parser | info |
| L09 | Glossary synonym used | Map each `avoid:` word to its term. The UI offers a surgical replace (like Vale's substitution check) [VALE] | warn |
| L10 | Acronym or Title-Case term that is not defined | Not in the glossary and not spelled out at first use (like Vale's conditional check) | info |
| L11 | Entry starts with "It"/"This"; contraction; no `@author` | Regex | warn |
| L12 | Warning notice comes after its step | AST order | info |

**Skill guidance only.** These need judgment, or a regex gives too many false positives:
- Noun clusters (they need a part-of-speech tagger).
- Missing articles and the correct tense.
- Pronouns that do not clearly point to one thing.
- Whether text is procedural or descriptive.
- Whether a criterion is achievable, relevant and complete.
- INVEST size and independence.
- Whether a decision lists real alternatives.
- Whether a learning is general enough to promote.
- When to add a glossary term.

The workflow and library skills ship these as a self-check that the agent runs before each append.

## 4. Workspace glossary

`glossary.md` is at the workspace root. A group's `_glossary.md` inherits the parent's terms and can add new ones. It cannot redefine a parent term.

```markdown
## issue
kind: noun
means: A folder that contains `goal.md`. The unit of work on the board.
avoid: ticket, task, card, story

## promote
kind: verb
means: Copy a learning or decision into the library as a general rule.
avoid: publish, upstream
```

- **Index:** two maps go into the shared automaton:
  - `term → entry` (case-folded and stemmed)
  - `avoid word → term`
- **Lints:**
  - G1: a synonym is used (L09).
  - G2: an acronym is not defined (L10).
  - G3: a word is in two `avoid` lists, a term has two `means`, or a child glossary redefines a parent term.
  - G4: an undefined Title-Case term appears in 3 or more issues. The Library pane lists it as a candidate.
- **Rules:** code in backticks is exempt. If a word needs two meanings, use qualified terms, for example `run (agent)` and `run (CI)`.
- **UI:**
  - Hovering a term shows its meaning.
  - The Library pane has a Glossary tab.
  - Agents use `wf glossary add|check`.
  - The library-curation skill proposes terms when an item is promoted.
- **Seed terms:** workspace, group, issue, entry, change, decision, learning, criterion, step, author, library item, promote, append, archify block. The `kind: verb` entries are the verb list for L04/L05. We write that list ourselves and do not copy it from the STE dictionary.

**Assumptions to confirm:**
- The 20/25-word limits.
- All lints are warnings.
- `must` is accepted in place of `shall`.
- `SC-n` IDs are optional.
- The definition of done is inherited through `_group.md`.
- A child glossary cannot override a parent term.

**Sources:**
- [W] https://en.wikipedia.org/wiki/Simplified_Technical_English
- [SKY] https://skybrary.aero/articles/simplified-technical-english-ste
- [SE] https://simplified-english.co.uk/rules-ste9.html
- [FAQ] https://asd-ste100.org/STE_faq.html
- [DL] https://www.asd-europe.org/standards-specifications/simplified-technical-english/download-asd-ste-100
- [MAV] https://alistairmavin.com/ears/
- [EARS] https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax
- [KIRO] https://kiro.dev/docs/specs/concepts
- [CUC] https://cucumber.io/docs/gherkin/reference/
- [SG] https://scrumguides.org/scrum-guide.html
- [INV] https://www.boost.co.nz/blog/2021/10/invest-criteria
- [SMART] https://en.wikipedia.org/wiki/SMART_criteria
- [INC] https://specinnovations.com/blog/how-to-ensure-requirements-are-clear-and-unambiguous
- [PV] https://github.com/btford/passive-voice
- [VALE] https://docs.vale.sh/checks/conditional