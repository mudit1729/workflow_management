#!/usr/bin/env bash
# wf-env.sh: small helpers the wf skills share. Plain bash and POSIX tools, no other dependency.
#
#   wf-env.sh root                  print the workspace folder (the one with workflow.toml)
#   wf-env.sh config <table.key>    print one value of workflow.toml, e.g. leases.minutes
#   wf-env.sh now                   current time as RFC 3339, minute precision: 2026-10-30T14:05+05:30
#   wf-env.sh later <minutes>       the same, <minutes> from now (for lease_until)
#   wf-env.sh now-epoch             the same instant as seconds since 1970 (wf-status.sh compares leases with it)
#   wf-env.sh id <kind>             a fresh id nobody uses yet. kind: issue group library change
#                                   decision learning request
#   wf-env.sh issue <id|slug|path>  print the folder of one issue
#   wf-env.sh author                print the author handle from WF_AUTHOR, as @handle
#
# WF_NOW=<RFC 3339 time> makes "now" that instant for now, later and now-epoch (and so for
# wf-status.sh): leases, staleness and ready tasks are judged at that time. The dashboard moves the
# sample world to the real clock when it loads it; the files under web/mock/sample are still
# written at 2026-10-22T16:27+05:30, so WF_NOW=2026-10-22T16:27+05:30 on those files gives the
# answers the dashboard shows ("lease 35m left"). Unset, the real clock is used.
#
# Exit codes: 0 ok, 1 not found or bad value (the reason goes to stderr).
set -euo pipefail

die() { echo "wf-env: $*" >&2; exit 1; }

is_workspace() { [ -f "$1/workflow.toml" ] && grep -q '^wf_format' "$1/workflow.toml"; }

find_root() {
  if [ -n "${WF_ROOT:-}" ]; then
    is_workspace "$WF_ROOT" || die "WF_ROOT=$WF_ROOT has no workflow.toml"
    (cd "$WF_ROOT" && pwd); return
  fi
  local dir; dir="$(pwd)"
  while [ "$dir" != "/" ]; do
    if is_workspace "$dir"; then echo "$dir"; return; fi
    dir="$(dirname "$dir")"
  done
  # Not inside a workspace: look at the usual places of the repo that holds the current folder.
  local top; top="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  local cand
  for cand in "$top/workspace" "$top/web/mock/workspace"; do
    if is_workspace "$cand"; then
      echo "wf-env: no workflow.toml above $(pwd); using $cand" >&2
      echo "$cand"; return
    fi
  done
  die "no workflow.toml above $(pwd). cd into the workspace or set WF_ROOT."
}

config() { # config table.key  (strings lose their quotes; the value is the first match)
  local root; root="$(find_root)"
  awk -v want="$1" '
    /^\[/ { t = $0; gsub(/[\[\] \t]/, "", t); next }
    /^[ \t]*#/ || /^[ \t]*$/ { next }
    {
      line = $0; k = line; sub(/[ \t]*=.*/, "", k); gsub(/[ \t]/, "", k)
      v = line; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t]+#.*$/, "", v); gsub(/^"|"$/, "", v)
      name = (t == "" ? k : t "." k)
      if (name == want) { print v; found = 1; exit }
    }
    END { exit found ? 0 : 1 }
  ' "$root/workflow.toml" || die "no key $1 in $root/workflow.toml"
}

fmt_ts() { sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }

# epoch_of <RFC 3339 time>: seconds since 1970 (GNU date, else BSD date).
epoch_of() {
  local ts="$1" compact
  compact="$(printf '%s' "$ts" | sed -E 's/([+-][0-9]{2}):([0-9]{2})$/\1\2/; s/Z$/+0000/')"
  date -d "$ts" +%s 2>/dev/null && return 0
  date -j -f "%Y-%m-%dT%H:%M%z" "$compact" +%s 2>/dev/null && return 0
  return 1
}

# The offset of WF_NOW as "+05:30" and in seconds.
now_offset() {
  local o; o="$(printf '%s' "$WF_NOW" | sed -nE 's/.*([+-][0-9]{2}):?([0-9]{2})$/\1:\2/p')"
  case "$WF_NOW" in *Z) o="+00:00";; esac
  [ -n "$o" ] || die "WF_NOW needs an offset: $WF_NOW (for example 2026-10-22T16:27+05:30)"
  echo "$o"
}

now_epoch() {
  if [ -n "${WF_NOW:-}" ]; then
    epoch_of "$WF_NOW" || die "WF_NOW is not an RFC 3339 time: $WF_NOW"
  else
    date +%s
  fi
}

# stamp_of <epoch> <+hh:mm>: the wall time at that offset, minute precision.
stamp_of() {
  local epoch="$1" off="$2" sign hh mm secs wall
  sign="${off%%[0-9]*}"; hh="${off#?}"; mm="${hh#*:}"; hh="${hh%%:*}"
  secs=$(( 10#$hh * 3600 + 10#$mm * 60 ))
  [ "$sign" = "-" ] && secs=$(( -secs ))
  wall=$(( epoch + secs ))
  if date -u -d "@$wall" +%Y-%m-%dT%H:%M >/dev/null 2>&1; then
    printf '%s%s\n' "$(date -u -d "@$wall" +%Y-%m-%dT%H:%M)" "$off"      # GNU date
  else
    printf '%s%s\n' "$(date -u -r "$wall" +%Y-%m-%dT%H:%M)" "$off"       # BSD date (macOS)
  fi
}

now_ts() {
  if [ -n "${WF_NOW:-}" ]; then stamp_of "$(now_epoch)" "$(now_offset)"; return; fi
  date +%Y-%m-%dT%H:%M%z | fmt_ts
}

later_ts() {
  case "${1:-}" in ''|*[!0-9]*) die "later needs a number of minutes";; esac
  if [ -n "${WF_NOW:-}" ]; then stamp_of $(( $(now_epoch) + $1 * 60 )) "$(now_offset)"; return; fi
  if date -d "+$1 minutes" +%Y-%m-%dT%H:%M%z >/dev/null 2>&1; then
    date -d "+$1 minutes" +%Y-%m-%dT%H:%M%z | fmt_ts      # GNU date
  else
    date -v+"$1"M +%Y-%m-%dT%H:%M%z | fmt_ts              # BSD date (macOS)
  fi
}

new_id() {
  local root prefix cand n=0
  root="$(find_root)"
  case "${1:-}" in
    issue) prefix="$(config workspace.id_prefix 2>/dev/null || echo wf)-" ;;
    group) prefix="g-" ;;
    library) prefix="lib-" ;;
    change) prefix="C-" ;;
    decision) prefix="D-" ;;
    learning) prefix="L-" ;;
    request) prefix="Q-" ;;
    *) die "id kind must be one of: issue group library change decision learning request" ;;
  esac
  while [ "$n" -lt 50 ]; do
    cand="$prefix$(LC_ALL=C tr -dc '0-9a-hjkmnp-tv-z' </dev/urandom | head -c 5 || true)"
    if [ "${#cand}" -eq $((${#prefix} + 5)) ] && ! grep -rqF --exclude-dir=.git --exclude-dir=.wf -- "$cand" "$root"; then
      echo "$cand"; return
    fi
    n=$((n + 1))
  done
  die "could not find a free id"
}

find_issue() {
  local root issues arg="${1:-}"
  [ -n "$arg" ] || die "issue needs an id, a slug or a path"
  root="$(find_root)"; issues="$root/$(config workspace.issues_dir 2>/dev/null || echo issues)"
  if [ -f "$arg/goal.md" ]; then (cd "$arg" && pwd); return; fi
  if [ -f "$root/$arg/goal.md" ]; then (cd "$root/$arg" && pwd); return; fi
  local hits
  hits="$(grep -rl --include=goal.md -E "^id: ${arg}\$" "$issues" 2>/dev/null || true)"
  if [ -z "$hits" ]; then
    hits="$(find "$issues" -type f -name goal.md -path "*/${arg}/goal.md" 2>/dev/null || true)"
  fi
  [ -n "$hits" ] || die "no issue '$arg' under $issues"
  [ "$(echo "$hits" | wc -l | tr -d ' ')" -eq 1 ] || die "'$arg' matches more than one issue: $(echo "$hits" | tr '\n' ' ')"
  dirname "$hits"
}

case "${1:-}" in
  root) find_root ;;
  config) [ -n "${2:-}" ] || die "config needs table.key"; config "$2" ;;
  now) now_ts ;;
  now-epoch) now_epoch ;;
  later) later_ts "${2:-}" ;;
  id) new_id "${2:-}" ;;
  issue) find_issue "${2:-}" ;;
  author) [ -n "${WF_AUTHOR:-}" ] || die "WF_AUTHOR is not set. Use the handle of your runtime from authors.md (codex = @codex, claude = @claude)."
          echo "@${WF_AUTHOR#@}" ;;
  ''|-h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" ;;
  *) die "unknown command '$1'. Run wf-env.sh --help." ;;
esac
