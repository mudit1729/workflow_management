# Skill triggers

Input for the flowchart. One row per skill: when an agent runs it, what it reads and what it writes.

## workflow

| Skill | Run it when | Reads | Writes |
|---|---|---|---|
| `write-goal` | A new issue has no criteria | `goal.md` | `goal.md` |
| `write-plan` | An issue has criteria and no tasks | `goal.md` | `plan.md` |
| `write-current-state` | You stop work or hand off | all files | `current_state.md` |
| `split-issue` | An issue holds more than 10 tasks | `plan.md` | a group and new issues |
| `write-decision` | You choose between options | `decisions.md` | `decisions.md` |
| `write-learning` | You find a rule worth keeping | `learnings.md` | `learnings.md` |

## library

| Skill | Run it when | Reads | Writes |
|---|---|---|---|
| `promote-to-library` | A learning applies to other issues | `learnings.md` | `library/` draft |
| `curate-library` | A draft waits for a review | `library/` | `library/` |
| `search-library` | You start a task in an unfamiliar area | `library/` | nothing |
| `retire-library-item` | A newer item replaces an old one | `library/` | `library/` |

## agent-execution

| Skill | Run it when | Reads | Writes |
|---|---|---|---|
| `resume-issue` | A session starts on an issue | context bundle | nothing |
| `claim-task` | You pick the next ready task | `plan.md` | `plan.md` |
| `record-change` | You finish one change | git diff | `changes.md` |
| `ask-for-input` | You need a human answer | `current_state.md` | `current_state.md` |
