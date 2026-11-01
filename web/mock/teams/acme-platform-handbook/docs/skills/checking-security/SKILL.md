---
name: checking-security
description: Use when a task of a wf issue changed code and its diff must be reviewed before the work moves on, such as a "Security check" step after Do next step. Reads the diff of the task and reports pass or fail with evidence for secrets, unsafe input handling and risky dependencies. Read-only. Avoid for tasks that changed only markdown, for reviewing style or design, and for fixing what it finds.
---

# Checking security

A short review of one task's diff. It reads and reports; it never edits a file.

## Steps

1. **Get the diff.** The commit sha the caller gives you (Do next step hands it over before it writes the log entry, so there is no entry to read yet): `git show --stat --patch <sha>`. No sha (the Do next step ran with `commit = none`)? Use `git diff HEAD` and say so in the report. Note the files and the added lines; ignore removed lines.
2. **Look for secrets.** Added lines that hold a private key header (`-----BEGIN`), a token or key with a value (`api_key`, `secret`, `password`, `token`, `AKIA` followed by 16 characters), a connection string with a password, or a committed `.env` or key file. A placeholder (`<your-token>`, `changeme`) is not a finding.
3. **Look for unsafe input handling.** Added code that builds a shell command, a SQL statement or a file path from request, user or file input without escaping or a whitelist: `exec`, `eval`, `os.system`, string-built queries, `innerHTML`, `dangerouslySetInnerHTML`, `../` joins, deserialising untrusted data.
4. **Look for risky dependencies.** New or changed entries in `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt` or a lockfile: an unpinned range (`*`, `latest`), a git or URL source, a package with an install script, a name one letter away from a popular package. List each new dependency with its version.
5. **Report.** One line a log entry can keep as `evidence`, then one line per finding.

```
security: pass: 0 findings in 6 files at 4e7a1c2
security: fail: 2 findings in 6 files at 4e7a1c2
- src/api/search.ts:41 builds a SQL string from req.query.id (use a parameter)
- package.json adds left-pad@* (pin a version)
```

`pass` needs all three checks done with no finding. `fail` names the file, the line and the fix. A check that could not run (no git, no diff) is a `fail` with the reason, never a `pass`.

When the flow marks this step as required, the run that called it stops on `fail` (`../using-wf/references/format.md` section 8, `kind: failure`). When it is optional, the run logs the finding and goes on.

## Red flags

- You edited a file or ran the code under review.
- You reported `pass` without reading the diff.
- A finding has no file and line.
