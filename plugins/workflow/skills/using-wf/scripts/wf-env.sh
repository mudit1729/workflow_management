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
#   wf-env.sh flow                  the skills flow: the skill that runs each step, one line per step
#                                   (<step> <skill> <source> <origin> [option=value ...]), then the custom
#                                   steps (after:<step> <id> <skill> <required> <origin>), then the
#                                   references that did not resolve (unresolved ...)
#   wf-env.sh flow <step>           the skill in effect for a step: add plan do log handoff status style
#   wf-env.sh flow <step> <option>  one option of a step in effect, e.g. flow plan max_tasks
#   wf-env.sh flow custom <step>    the custom steps that run after add, plan, do or handoff, in running
#                                   order, one per line: <id>|<skill>|<required>|<label>
#   wf-env.sh flow path <ref>       the SKILL.md of a skill reference: <name> (built-in), ws:<name>,
#                                   me:<name> or <alias>:<name> (a team library)
#   wf-env.sh flow origin <step> <option>
#                                   whose value an option has: built-in (the default), team or me
#
# The flow (docs/plan/proposals/skills-flow-spec.md): for a step and a key (skill or an option) the
# personal library's library.toml [flow.<step>] wins, then workflow.toml [flow.<step>], then the built-in
# default. Four options are team only and live in their old tables: handoff budget_tokens and changes
# ([context]), status issue_hours and task_hours ([staleness]). Custom steps ([flow.custom.<id>]) run
# team first (by order, then id), then the person's. A reference that does not resolve falls back to the
# built-in skill and is reported on stderr and by "flow". The personal library is $WF_LIBRARY, else the
# one clone under ${WF_LIBRARIES:-~/.wf/libraries}/<owner>/<repo> whose library.toml says
# kind = "personal"; having none is not an error. Team aliases come from its libraries.toml.
# A count (max_tasks, budget_tokens, ...) and an order are TOML integers: 8, +8, 1_000 and 0x10 are
# numbers, 2.0, 1e1, -3 and "8" in quotes are not (a count must also be above 0). A skill or a label of
# white space only counts as unset.
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
  local root v; root="$(find_root)"
  v="$(kv_get "$(toml_kv "$root/workflow.toml")" "$1")" || die "no key $1 in $root/workflow.toml"
  printf '%s\n' "$v"
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

# --- The skills flow (docs/plan/proposals/skills-flow-spec.md sections 2 to 4) ---

# The folder that holds using-wf and its sibling skills (the built-ins, and any skill installed beside them).
SKILLS_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLOW_STEPS="add plan do log handoff status style"

builtin_skill() {
  case "$1" in
    add) echo adding-work ;; plan) echo planning-issues ;; do) echo doing-next-step ;;
    log) echo logging-work ;; handoff) echo handing-off ;; status) echo checking-status ;;
    style) echo writing-readable-bulk-text ;;
    *) die "unknown step '$1'. Steps: $FLOW_STEPS" ;;
  esac
}

step_options() {
  case "$1" in
    add) echo then ;; plan) echo max_tasks ;; do) echo "finish commit" ;;
    handoff) echo "budget_tokens changes" ;; status) echo "issue_hours task_hours" ;;
  esac
}

option_default() {
  case "$1.$2" in
    add.then) echo offer ;; plan.max_tasks) echo 8 ;; do.finish) echo verify ;; do.commit) echo task ;;
    handoff.budget_tokens) echo 6000 ;; handoff.changes) echo 5 ;;
    status.issue_hours) echo 24 ;; status.task_hours) echo 4 ;;
  esac
}

# The four team-only options keep the table they had before the flow existed.
option_table() {
  case "$1.$2" in
    handoff.budget_tokens|handoff.changes) echo context ;;
    status.issue_hours|status.task_hours) echo staleness ;;
  esac
}

option_ok() { # option_ok <step> <option> <value> [q]: q says the value was written in quotes, so it is a string; a count is plain digits (flow_value has read a TOML integer into them)
  case "$1.$2" in
    add.then) case "$3" in offer|plan|stop) return 0 ;; esac ;;
    do.finish) case "$3" in verify|review) return 0 ;; esac ;;
    do.commit) case "$3" in task|none) return 0 ;; esac ;;
    *) [ -z "${4:-}" ] && [[ $3 =~ ^[1-9][0-9]{0,14}$ ]] && return 0 ;;
  esac
  return 1
}

# toml_kv <file>: every `key = value` of a TOML file as "table.key<TAB>value". Strings lose their quotes
# (a # inside quotes stays, and a third field "q" says the value was a string, so "5" is not the number
# 5), a comment after a value or a table header is dropped, and the blocks of [[x]] are numbered:
# x.1.key, x.2.key. A quoted part of a table name or a key reads like a bare one: [flow."plan"] is
# [flow.plan], as in any TOML reader. Arrays and inline tables come back as raw text. Nothing for a
# missing file. `config`, the flow and the libraries all read through it.
toml_kv() {
  [ -f "$1" ] || return 0
  awk '
    function value(s,   i, c, q, out) {
      sub(/^[ \t]+/, "", s)
      q = substr(s, 1, 1)
      quoted = (q == "\"" || q == "\047")
      if (quoted) {
        out = ""
        for (i = 2; i <= length(s); i++) {
          c = substr(s, i, 1)
          if (c == q) break
          if (c == "\\" && q == "\"") {
            c = substr(s, ++i, 1)
            if (c != "\"" && c != "\\") out = out "\\"
          }
          out = out c
        }
        return out
      }
      sub(/[ \t]*#.*$/, "", s); sub(/[ \t]+$/, "", s)
      return s
    }
    # header(s): is the line a table header, [a.b] or [[a.b]], with bare or quoted parts and maybe a comment
    # after it? Sets hname (the parts joined by "."; a "." inside a quoted part becomes \034, so it cannot
    # pass for a table level) and blk (an [[x]] block), and returns 1; returns 0 for any other line, such
    # as a row of a multi-line array.
    function header(s,   i, c, q, seg, parts) {
      sub(/^[ \t]+/, "", s)
      if (substr(s, 1, 1) != "[") return 0
      blk = (substr(s, 2, 1) == "[")
      i = blk ? 3 : 2; hname = ""
      for (;;) {
        while (substr(s, i, 1) ~ /[ \t]/) i++
        c = substr(s, i, 1); seg = ""
        if (c == "\"" || c == "\047") {
          q = c
          for (i++; i <= length(s) && substr(s, i, 1) != q; i++) seg = seg substr(s, i, 1)
          if (i > length(s)) return 0
          i++; gsub(/\./, "\034", seg)
        } else {
          for (; substr(s, i, 1) ~ /[A-Za-z0-9_-]/; i++) seg = seg substr(s, i, 1)
          if (seg == "") return 0
        }
        hname = (parts++ ? hname "." : "") seg
        while (substr(s, i, 1) ~ /[ \t]/) i++
        c = substr(s, i, 1)
        if (c == ".") { i++; continue }
        if (c != "]") return 0
        i++
        if (blk) { if (substr(s, i, 1) != "]") return 0; i++ }
        while (substr(s, i, 1) ~ /[ \t]/) i++
        c = substr(s, i, 1)
        return (c == "" || c == "#")
      }
    }
    # depth(s): the count of [ minus the count of ] on a line, outside strings and comments.
    function depth(s,   i, c, q, d) {
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (q != "") { if (c == "\\" && q == "\"") i++; else if (c == q) q = ""; continue }
        if (c == "\"" || c == "\047") q = c
        else if (c == "#") break
        else if (c == "[") d++
        else if (c == "]") d--
      }
      return d + 0
    }
    { sub(/\r$/, "") }
    /^[ \t]*(#|$)/ { next }
    adepth > 0 { adepth += depth($0); next }    # the rows of a multi-line array are neither keys nor headers
    header($0) {
      if (blk) { n[hname]++; hname = hname "." n[hname] }
      t = hname; next
    }
    {
      if ($0 !~ /=/) next
      k = $0; sub(/[ \t]*=.*/, "", k); sub(/^[ \t]+/, "", k); gsub(/["\047]/, "", k)
      v = $0; sub(/^[^=]*=/, "", v)
      raw = v; sub(/^[ \t]+/, "", raw)
      adepth = (substr(raw, 1, 1) == "[") ? depth(raw) : 0
      v = value(v)
      print (t == "" ? k : t "." k) "\t" v (quoted ? "\tq" : "")
    }
  ' "$1"
}

kv_get() { # kv_get <dump> <name>: the first value of a name; nothing and exit 1 when there is none
  awk -F'\t' -v k="$2" '$1 == k { print $2; f = 1; exit } END { exit f ? 0 : 1 }' <<<"$1"
}

kv_str() { # kv_str <dump> <name>: the first value of a name when it is a string; nothing and exit 1 otherwise
  awk -F'\t' -v k="$2" '$1 == k { if ($3 == "q") { print $2; f = 1 } exit } END { exit f ? 0 : 1 }' <<<"$1"
}

kv_quoted() { # kv_quoted <dump> <name>: success when the first value of a name was written in quotes
  awk -F'\t' -v k="$2" '$1 == k { r = ($3 == "q"); exit } END { exit r ? 0 : 1 }' <<<"$1"
}

# toml_int <text>: a TOML integer (decimal with an optional + and _ between digits, or 0x, 0o, 0b) as a
# plain decimal number, 15 digits at most. Fails for anything else: a float such as 2.0 or 1e1 is not an
# integer, and neither is -5 here (a count or an order is never negative). Whether the value was in
# quotes is the caller's question (kv_quoted).
toml_int() {
  local t="$1" base=10 d
  case "$t" in
    0x*) base=16; d="${t#0x}"; [[ $d =~ ^[0-9A-Fa-f]+(_[0-9A-Fa-f]+)*$ ]] || return 1 ;;
    0o*) base=8; d="${t#0o}"; [[ $d =~ ^[0-7]+(_[0-7]+)*$ ]] || return 1 ;;
    0b*) base=2; d="${t#0b}"; [[ $d =~ ^[01]+(_[01]+)*$ ]] || return 1 ;;
    *) d="${t#+}"; [[ $d =~ ^(0|[1-9][0-9]*(_[0-9]+)*)$ ]] || return 1 ;;
  esac
  d="${d//_/}"
  [ "${#d}" -le 15 ] || return 1
  echo $(( ${base}#${d} ))
}

# blank <text>: success when the text is empty or only white space (the dashboard trims such a value away)
blank() { [ -z "${1//[[:space:]]/}" ]; }

# The personal library, by the wf-lib.sh rules: $WF_LIBRARY, else the one clone under
# ${WF_LIBRARIES:-~/.wf/libraries}/<owner>/<repo> whose library.toml says kind = "personal". Prints its
# folder, or nothing: having none is not an error here, and an unusable setting is a note on stderr.
personal_root() {
  local home f hit="" n=0
  if [ -n "${WF_LIBRARY:-}" ]; then
    if [ -f "$WF_LIBRARY/library.toml" ]; then (cd "$WF_LIBRARY" && pwd)
    else echo "wf-env: flow: WF_LIBRARY=$WF_LIBRARY has no library.toml; no personal flow" >&2; fi
    return 0
  fi
  home="${WF_LIBRARIES:-${HOME:-}/.wf/libraries}"
  for f in "$home"/*/*/library.toml; do
    if [ -f "$f" ] && grep -Eq '^kind[[:space:]]*=[[:space:]]*"personal"' "$f"; then
      hit="$(dirname "$f")"; n=$((n + 1))
    fi
  done
  case "$n" in
    0) ;;
    1) printf '%s\n' "$hit" ;;
    *) echo "wf-env: flow: more than one personal library under $home; set WF_LIBRARY. No personal flow." >&2 ;;
  esac
}

flow_warn() { echo "wf-env: flow: $*" >&2; }
custom_note() { CUSTOM_NOTES="${CUSTOM_NOTES}wf-env: flow: $*"$'\n'; }

# flow_load: find the workspace and the personal library once, read the three files and list the
# custom steps. Sets FLOW_ROOT, TEAM_KV (workflow.toml), ME_ROOT, ME_KV (library.toml), ME_LIBS_KV
# (libraries.toml) and CUSTOM (one "<origin>|<after>|<order>|<id>" row per valid custom step; the notes
# on the ones that are not valid wait in CUSTOM_NOTES for the commands that list custom steps).
flow_load() {
  local origin kv id after skill order
  FLOW_ROOT="$(find_root)"
  TEAM_KV="$(toml_kv "$FLOW_ROOT/workflow.toml")"
  ME_ROOT="$(personal_root)"; ME_KV=""; ME_LIBS_KV=""
  if [ -n "$ME_ROOT" ]; then
    ME_KV="$(toml_kv "$ME_ROOT/library.toml")"
    ME_LIBS_KV="$(toml_kv "$ME_ROOT/libraries.toml")"
  fi
  CUSTOM="" CUSTOM_NOTES=""
  for origin in team me; do
    kv="$(layer_kv "$origin")"
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      after="$(kv_get "$kv" "flow.custom.$id.after" || true)"
      skill="$(kv_str "$kv" "flow.custom.$id.skill" || true)"
      order="$(kv_get "$kv" "flow.custom.$id.order" || true)"
      [[ $id =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { custom_note "custom step '$id' is not a kebab-case id; ignored"; continue; }
      case "$after" in add|plan|do|handoff) ;; *) custom_note "custom step $id: after must be add, plan, do or handoff; ignored"; continue ;; esac
      ! blank "$skill" || { custom_note "custom step $id has no skill; ignored"; continue; }
      if kv_quoted "$kv" "flow.custom.$id.order" || ! order="$(toml_int "$order")"; then order=1; fi
      if [ "$origin" = me ] && printf '%s' "$CUSTOM" | grep -q "^team|[a-z]*|[0-9]*|$id\$"; then
        custom_note "custom step $id is a team step; a personal step cannot change it; ignored"; continue
      fi
      CUSTOM="$CUSTOM$origin|$after|$order|$id"$'\n'
    done <<<"$(awk -F'\t' '$1 ~ /^flow\.custom\./ { id = substr($1, 13); sub(/\.[^.]*$/, "", id); if (!(id in s)) { s[id] = 1; print id } }' <<<"$kv")"
  done
}

# resolve_ref <ref>: a skill reference is <name> (built-in, a sibling of using-wf), ws:<name>
# (<workspace>/skills), me:<name> (<personal library>/skills) or <alias>:<name> (a team library of the
# personal libraries.toml, <clone>[/<root>]/skills). Sets REF_PATH (the SKILL.md it names), REF_SOURCE
# (built-in, workspace, me or library) and, when the file is not there, REF_WHY; returns 1 then.
resolve_ref() {
  local ref="$1" scope="" name="$1" dir="" b url root slug owner repo
  REF_PATH="" REF_SOURCE="" REF_WHY=""
  case "$ref" in *:*) scope="${ref%%:*}"; name="${ref#*:}" ;; esac
  [[ $name =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { REF_WHY="'$ref' is not a skill reference (name, ws:name, me:name or alias:name)"; return 1; }
  case "$scope" in
    "") REF_SOURCE=built-in; dir="$SKILLS_HOME" ;;
    ws) REF_SOURCE=workspace; dir="$FLOW_ROOT/skills" ;;
    me)
      REF_SOURCE=me
      [ -n "$ME_ROOT" ] || { REF_WHY="no personal library for $ref (set WF_LIBRARY, or clone it under ${WF_LIBRARIES:-~/.wf/libraries})"; return 1; }
      dir="$ME_ROOT/skills" ;;
    *)
      REF_SOURCE=library
      [[ $scope =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { REF_WHY="'$ref' is not a skill reference (name, ws:name, me:name or alias:name)"; return 1; }
      [ -n "$ME_ROOT" ] || { REF_WHY="no personal library, so no team library '$scope' for $ref"; return 1; }
      b="$(awk -F'\t' -v a="$scope" '$1 ~ /^team\.[0-9]+\.alias$/ && $2 == a { split($1, p, "."); print p[2]; exit }' <<<"$ME_LIBS_KV")"
      [ -n "$b" ] || { REF_WHY="no team library '$scope' in $ME_ROOT/libraries.toml (for $ref)"; return 1; }
      url="$(kv_get "$ME_LIBS_KV" "team.$b.url" || true)"; root="$(kv_get "$ME_LIBS_KV" "team.$b.root" || true)"
      slug="$(printf '%s' "$url" | sed -E 's#^(https?://|ssh://git@|git@)?(www\.)?github\.com[:/]##; s#\.git$##; s#/+$##')"
      owner="${slug%%/*}"; repo="${slug#*/}"; repo="${repo%%/*}"
      if ! [[ $owner =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] || ! [[ $repo =~ ^[A-Za-z0-9._-]+$ ]] || [ "$repo" = . ] || [ "$repo" = .. ]; then
        REF_WHY="team library '$scope' has no usable GitHub url in $ME_ROOT/libraries.toml"; return 1
      fi
      root="${root#./}"; root="${root%/}"
      case "$root" in /*|*..*) REF_WHY="team library '$scope' has an unsafe root '$root'"; return 1 ;; esac
      dir="${WF_LIBRARIES:-${HOME:-}/.wf/libraries}/$owner/$repo${root:+/$root}/skills" ;;
  esac
  REF_PATH="$dir/$name/SKILL.md"
  [ -f "$REF_PATH" ] || { REF_WHY="$REF_PATH is missing"; return 1; }
}

# effective <step>: sets E_REF, E_SOURCE and E_ORIGIN (built-in, team or me) for the skill in effect,
# and U_REF and U_ORIGIN when the reference that was named did not resolve (E_* is the built-in then).
effective() {
  local step="$1" ref="" origin=built-in v
  E_REF="$(builtin_skill "$step")"; E_SOURCE=built-in; E_ORIGIN=built-in; U_REF=""; U_ORIGIN=""
  if v="$(kv_str "$ME_KV" "flow.$step.skill")" && ! blank "$v"; then ref="$v"; origin=me
  elif v="$(kv_str "$TEAM_KV" "flow.$step.skill")" && ! blank "$v"; then ref="$v"; origin=team
  fi
  [ -n "$ref" ] || return 0
  if resolve_ref "$ref"; then
    E_REF="$ref"; E_SOURCE="$REF_SOURCE"; E_ORIGIN="$origin"
  else
    U_REF="$ref"; U_ORIGIN="$origin"
    flow_warn "$step: $ref ($origin) does not resolve: $REF_WHY. Using $E_REF."
  fi
}

# option_pick <step> <option>: sets O_VALUE (the value in effect) and O_ORIGIN (built-in, team or me).
# The personal value, else the team's, else the default; a value the option does not take is skipped with
# a note. The team-only options read their old table of workflow.toml and nothing else.
option_pick() {
  local step="$1" opt="$2" table
  table="$(option_table "$step" "$opt")"
  if [ -n "$table" ]; then
    O_ORIGIN=team; O_VALUE="$(flow_value "$TEAM_KV" "$table.$opt" "$step" "$opt")" && return 0
  else
    O_ORIGIN=me; O_VALUE="$(flow_value "$ME_KV" "flow.$step.$opt" "$step" "$opt")" && return 0
    O_ORIGIN=team; O_VALUE="$(flow_value "$TEAM_KV" "flow.$step.$opt" "$step" "$opt")" && return 0
  fi
  O_ORIGIN=built-in; O_VALUE="$(option_default "$step" "$opt")"
}

option_value() { option_pick "$@"; printf '%s\n' "$O_VALUE"; }

flow_value() { # flow_value <dump> <name> <step> <option>: print the value when it is set and valid
  local v n q=""
  v="$(kv_get "$1" "$2" || true)"
  [ -n "$v" ] || return 1
  ! kv_quoted "$1" "$2" || q=q
  if [ -z "$q" ] && n="$(toml_int "$v")"; then v="$n"; fi
  if option_ok "$3" "$4" "$v" "$q"; then echo "$v"; return 0; fi
  flow_warn "$3 $4: '$v' is not a value of this option; skipped"
  return 1
}

step_has_option() { local o; for o in $(step_options "$1"); do [ "$o" != "$2" ] || return 0; done; return 1; }

layer_kv() { if [ "$1" = team ]; then printf '%s' "$TEAM_KV"; else printf '%s' "$ME_KV"; fi; }

custom_label() { # custom_label <origin> <id> <skill>: the label, else the skill's name in words
  local v
  if v="$(kv_str "$(layer_kv "$1")" "flow.custom.$2.label")" && ! blank "$v"; then echo "$v"; return; fi
  printf '%s\n' "${3#*:}" | sed 's/-/ /g' | awk '{ print toupper(substr($0, 1, 1)) substr($0, 2) }'
}

custom_required() { # custom_required <origin> <id>
  local kv; kv="$(layer_kv "$1")"
  if [ "$(kv_get "$kv" "flow.custom.$2.required" || true)" = true ] && ! kv_quoted "$kv" "flow.custom.$2.required"; then echo true; else echo false; fi
}

custom_rows() { # custom_rows <after>: "<id>|<origin>" for the custom steps after a step, in running order
  local origin
  for origin in team me; do
    printf '%s' "$CUSTOM" | awk -F'|' -v o="$origin" -v a="$1" '$1 == o && $2 == a { print $3 "|" $4 "|" $1 }' \
      | LC_ALL=C sort -t'|' -k1,1n -k2,2 | cut -d'|' -f2-
  done
}

custom_skill() { kv_str "$(layer_kv "$1")" "flow.custom.$2.skill"; }

flow_all() {
  local step o line after id origin skill unresolved=""
  [ -z "$CUSTOM_NOTES" ] || printf '%s' "$CUSTOM_NOTES" >&2
  for step in $FLOW_STEPS; do
    effective "$step"
    line="$step $E_REF $E_SOURCE $E_ORIGIN"
    for o in $(step_options "$step"); do line="$line $o=$(option_value "$step" "$o")"; done
    echo "$line"
    [ -z "$U_REF" ] || unresolved="${unresolved}unresolved $step $U_REF $U_ORIGIN"$'\n'
  done
  for after in add plan do handoff; do
    while IFS='|' read -r id origin; do
      [ -n "$id" ] || continue
      skill="$(custom_skill "$origin" "$id" || true)"
      echo "after:$after $id $skill $(custom_required "$origin" "$id") $origin"
      resolve_ref "$skill" || {
        flow_warn "after $after: $id: $skill ($origin) does not resolve: $REF_WHY"
        unresolved="${unresolved}unresolved after:$after $id $skill $origin"$'\n'
      }
    done <<<"$(custom_rows "$after")"
  done
  printf '%s' "$unresolved"
}

# need_option <step> <option>: die unless the step is a step and has that option
need_option() {
  builtin_skill "$1" >/dev/null
  step_has_option "$1" "$2" || die "step $1 has no option '$2'. $(step_options "$1" | awk 'NF { print "Options: " $0; f = 1 } END { if (!f) print "It has no options." }')"
}

flow() {
  local step="${1:-}" opt="${2:-}" id origin skill
  flow_load
  case "$step" in
    "") flow_all ;;
    path)
      [ -n "$opt" ] || die "flow path needs a skill reference (name, ws:name, me:name or alias:name)"
      resolve_ref "$opt" || die "no skill $opt: $REF_WHY"
      echo "$REF_PATH" ;;
    origin)
      [ -n "$opt" ] && [ -n "${3:-}" ] || die "flow origin needs a step and an option, for example: flow origin do finish"
      need_option "$opt" "$3"
      option_pick "$opt" "$3"; echo "$O_ORIGIN" ;;
    custom)
      case "$opt" in add|plan|do|handoff) ;; *) die "flow custom needs a step: add plan do handoff" ;; esac
      [ -z "$CUSTOM_NOTES" ] || printf '%s' "$CUSTOM_NOTES" >&2
      while IFS='|' read -r id origin; do
        [ -n "$id" ] || continue
        skill="$(custom_skill "$origin" "$id" || true)"
        echo "$id|$skill|$(custom_required "$origin" "$id")|$(custom_label "$origin" "$id" "$skill")"
        resolve_ref "$skill" || flow_warn "$id: $skill ($origin) does not resolve: $REF_WHY"
      done <<<"$(custom_rows "$opt")" ;;
    *)
      builtin_skill "$step" >/dev/null
      if [ -z "$opt" ]; then effective "$step"; echo "$E_REF"; return 0; fi
      need_option "$step" "$opt"
      option_value "$step" "$opt" ;;
  esac
}

case "${1:-}" in
  root) find_root ;;
  config) [ -n "${2:-}" ] || die "config needs table.key"; config "$2" ;;
  now) now_ts ;;
  now-epoch) now_epoch ;;
  later) later_ts "${2:-}" ;;
  id) new_id "${2:-}" ;;
  issue) find_issue "${2:-}" ;;
  flow) shift; flow "$@" ;;
  author) [ -n "${WF_AUTHOR:-}" ] || die "WF_AUTHOR is not set. Use the handle of your runtime from authors.md (codex = @codex)."
          echo "@${WF_AUTHOR#@}" ;;
  ''|-h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" ;;
  *) die "unknown command '$1'. Run wf-env.sh --help." ;;
esac
