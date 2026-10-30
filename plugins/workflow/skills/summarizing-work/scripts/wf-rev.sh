#!/usr/bin/env bash
# wf-rev.sh: the rev of an issue folder or a group folder. It is 7 hex characters that change when
# the wf files at or below the folder change, so a summary written with that rev can tell when it is
# stale.
#
#   wf-rev.sh <folder>        an issue folder (holds goal.md) or a group folder below issues/
#
# The rev is the first 7 characters of the SHA-256 of one text stream. For every wf file at or
# below the folder, in byte order of the path relative to the folder, the stream holds the line
# "== <relative path>" and then the bytes of the file. The wf files are goal.md, plan.md,
# current_state.md, changes.md, decisions.md, learnings.md and _group.md. Folders named notes and
# evidence are not read: a note is logged in changes.md, which is read.
#
# Times are made neutral first, so a summary does not go stale when only the clock moved: every
# ISO time with a clock part (2026-10-22T16:27+05:30) reads "<time>", and the date of a due,
# created, last_reviewed or review_after line reads "<date>". A lease renewal rewrites a time and
# nothing else, so it does not change the rev. The dashboard computes the rev the same way.
#
# SHA-256 comes from sha256sum, else shasum -a 256 (macOS). Exit codes: 0 ok, 1 not a wf folder.
set -euo pipefail

die() { echo "wf-rev: $*" >&2; exit 1; }

dir="${1:-}"
case "$dir" in ''|-h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;; esac
[ -d "$dir" ] || die "no folder $dir"
cd "$dir"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; }

files="$(find . -type f \( -name goal.md -o -name plan.md -o -name current_state.md \
  -o -name changes.md -o -name decisions.md -o -name learnings.md -o -name _group.md \) \
  -not -path '*/notes/*' -not -path '*/evidence/*' | sed 's|^\./||' | LC_ALL=C sort)"
[ -n "$files" ] || die "no wf files in $dir (is it an issue or a group folder?)"

neutral() {
  sed -E \
    -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})/<time>/g' \
    -e "s/^([[:space:]]*(due|created|last_reviewed|review_after):[[:space:]]*[\"']?)[0-9]{4}-[0-9]{2}-[0-9]{2}/\\1<date>/" \
    "$1"
}

printf '%s\n' "$files" | while IFS= read -r f; do
  printf '== %s\n' "$f"
  neutral "$f"
done | sha256 | cut -c1-7
