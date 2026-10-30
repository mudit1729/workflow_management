---
name: writing-readable-bulk-text
description: Use when writing or rewriting many short AI-generated texts that people will skim as a list, feed or dashboard, such as issue titles, plan task names, change-log lines, decision and learning titles, current-state summaries, activity-feed lines or session titles. Also use to rewrite an existing board so its lines read consistently. Avoid for prose read top to bottom (specs, docs, long answers) and for one-off messages.
---

# Writing readable bulk text

Based on "Five Principles for Generating Readable AI Text in Bulk" by Shreya Shankar (fsdatalab.github.io/blog/agent-text-at-scale, 2026-10-29). Paraphrased; credit the original when you copy this skill.

A reader scans a list of 30 lines far more than they read it. Write every line so the first few words already tell it apart from its neighbours.

## Iron law

Never write one line of a list alone. Collect the whole list first, choose one shape for it, then write every line in that shape.

## Procedure

1. **Collect the list.** All sibling lines the reader will see together: one column of titles, one day of log entries, one group's tasks.
2. **Fix the shape.** One sentence pattern, one tense, one word per concept (see the table below). Use the terms in the workspace `glossary.md`.
3. **Draft each line** with the words that make it different from its siblings first.
4. **Scan test.** Read only the first four words of each line. If two lines look alike, or a line says nothing yet, reorder it.
5. **Variation test.** Find every line that differs in form from the rest. Keep the difference only if the item really differs (a failure, a blocked task). Otherwise copy the shape.
6. **Tone test.** The verbs say what the list is for: `Failed`, `Blocked on` in a problem list; `Verified`, `Shipped` in a done list.
7. **Check meaning.** The rewrite adds no fact and drops none.

## The five principles

1. **Match how readers parse sentences.** Start with the subject or the verb. When every line has the same subject (the team, the agent, "the issue"), drop it and start with the verb. Pick the first verb's tense by what the reader expects: past for what happened, continuous for what is under way, imperative or future for what comes next.
2. **Put the most important words first.** Find what is different about this line compared with the others and move that to the front. Context every line shares goes last or nowhere.
3. **Use one structure and one vocabulary.** Same pattern for every line; one word per concept. If the workspace says `issue`, never write `ticket`, `card` or `story` (contract glossary).
4. **Vary only to show a real difference.** Readers assume that any difference means something. Give every card the same components in the same order. Add a clause, a marker or a different opener only when the item is different.
5. **Match the verb's tone to the list's purpose.** A problem list uses clearly negative verbs, a praise list clearly positive ones, a neutral list neutral ones. Do not soften a failure.

## Shapes for a wf workspace

Proposal for review. Each row fixes the pattern for one list.

| Surface (file) | Shape | Tense | Before → after |
|---|---|---|---|
| Issue title (`goal.md` title) | verb, object, qualifier | imperative | `Live board updates` → `Push board updates over SSE` |
| Plan task name (`plan.md`) | verb, object | imperative | `SSE delta stream` → `Stream deltas over SSE` |
| Change entry (`changes.md` heading) | past verb, object, result | past | `The watcher lost rename events` → `Lost rename events in notify 9.0-rc` |
| Decision title (`decisions.md`) | the choice as a verb phrase | imperative | `SSE vs polling` → `Push board updates over SSE` |
| Learning title (`learnings.md`) | the rule, subject first | present | `Be careful with mtime` → `Compare files by blake3 hash, never by mtime.` |
| Current state (`current_state.md` summary) | thing, state | present or continuous | `We are working on resync` → `Delta stream works end to end; resync in flight.` |
| Success criterion | EARS keyword kept; distinguishing event first | present | keep the `WHEN … the system SHALL …` form from the contract |
| Activity line / toast | actor, past verb, object | past | `Task T-3 was ticked by @codex` → `@codex ticked T-3` |
| Group name (`_group.md`) | the area as a noun | noun | one noun per group, no verbs |

Do not change `id:`, anchors (`{#C-3m8tz}`), links (`[[#T-3]]`), front-matter keys, code spans, numbers, paths or URLs.

## Rewriting an existing board

1. List every surface in the table that has text in the workspace.
2. Take one surface at a time and read all of its lines before editing any.
3. Edit headings, titles and summaries only; leave bodies unless a body line is itself a list entry.
4. Run `wf lint` when it is available; the rewrite adds no new findings.
5. One commit per surface, message `Rewrite <surface> for scanning`.

## Rationalizations

| You think | Reality |
|---|---|
| A longer title is clearer. | The scan reads four words. Cut the tail. |
| Varying the phrasing reads less robotic. | Different phrasing reads as different meaning. Keep the shape. |
| "This issue" or "The agent" gives context. | Every line shares it. Drop it. |
| A softer verb sounds friendlier. | A failed run is `Failed`. Say it. |
| One odd line is fine. | The reader will look for why it is odd. |

## Red flags

- Three or more lines in a row open with the same non-verb words.
- A list mixes tenses (`Added …`, `Adding …`, `Will add …`) without a reason in the item.
- Two words for one concept in one view.
- The distinguishing word is last.
- A line is longer than its neighbours with nothing different about it.

## Checks for this skill

- Given 10 mixed-shape issue titles, the output has one shape and no two lines start with the same two words unless the verb itself differs.
- Given a log that mixes `Adding`, `Added` and `Will add`, the output uses one tense per list.
- Given a failure entry, the output keeps a clearly negative verb.
- Given `id`, anchors and code spans, the output leaves them byte for byte.
