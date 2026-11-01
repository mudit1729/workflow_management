---
name: tidying-up
description: Use when a task of a flow-fixture issue is committed and its working tree must be clean. Removes build output the task created and prints the git status. Avoid for files the task meant to keep.
---

# Tidying up

Remove only the files the task created that are not part of its result, then print `git status --short`.
