#!/usr/bin/env bash
# wf-status.sh: terminal report for a wf workspace or for one issue. Read-only.
#
#   wf-status.sh                      status counts, needs-you requests, expired leases, stale
#                                     work and ready tasks across the workspace
#   wf-status.sh <id|slug|path>       the same for one issue, plus its criteria, tasks, next
#                                     step, and the commits, pull requests and CI runs that
#                                     mention the id (git and gh; a missing source is skipped)
#   wf-status.sh --ready [<issue>]    only the ready tasks, one per line
#
# Options: --no-git (skip git and gh), --root DIR (the workspace; else WF_ROOT, else the
# nearest workflow.toml above the current folder), --repo DIR (the repository whose commits,
# pull requests and CI to report; else WF_REPO, else the workspace's own repository).
# WF_NOW=<RFC 3339 time> judges leases, staleness and ready tasks at that instant instead of the
# real clock (see wf-env.sh). The files of web/mock/sample were written at 2026-10-22T16:27+05:30;
# the dashboard moves them to the real clock, so use that time to get the dashboard's answers.
# Plain bash and awk, no other dependency. Exit 0, or 1 when the workspace or issue is missing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_SH="$HERE/../../using-wf/scripts/wf-env.sh"
[ -x "$ENV_SH" ] || { echo "wf-status: cannot find using-wf/scripts/wf-env.sh next to this skill" >&2; exit 1; }

ISSUE_ARG="" READY_ONLY=0 USE_GIT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --ready) READY_ONLY=1 ;;
    --no-git) USE_GIT=0 ;;
    --root) shift; export WF_ROOT="${1:?--root needs a folder}" ;;
    --repo) shift; export WF_REPO="${1:?--repo needs a folder}" ;;
    -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    -*) echo "wf-status: unknown option $1" >&2; exit 1 ;;
    *) ISSUE_ARG="$1" ;;
  esac
  shift
done

ROOT="$("$ENV_SH" root)"
REPO="${WF_REPO:-$ROOT}"
cfg() { WF_ROOT="$ROOT" "$ENV_SH" config "$1" 2>/dev/null || echo "$2"; }
ISSUES_DIR="$ROOT/$(cfg workspace.issues_dir issues)"
[ -d "$ISSUES_DIR" ] || { echo "wf-status: no folder $ISSUES_DIR" >&2; exit 1; }

ONLY=""
if [ -n "$ISSUE_ARG" ]; then
  ONLY="$(WF_ROOT="$ROOT" "$ENV_SH" issue "$ISSUE_ARG")"
fi
NOW_TS="$(WF_ROOT="$ROOT" "$ENV_SH" now)"
NOW_EPOCH="$(WF_ROOT="$ROOT" "$ENV_SH" now-epoch)"

FILES="$(find "$ISSUES_DIR" -type f \( -name goal.md -o -name plan.md -o -name current_state.md -o -name changes.md \) \
  -not -path '*/node_modules/*' -not -path '*/.git/*' | sort)"
if [ -z "$FILES" ]; then
  echo "wf status · $ROOT · $NOW_TS"
  echo "No issues yet. Use the adding-work skill to add some."
  exit 0
fi

LIST="$(mktemp "${TMPDIR:-/tmp}/wf-status.XXXXXX")"
trap 'rm -f "$LIST"' EXIT
echo "$FILES" > "$LIST"

awk -v listfile="$LIST" \
  -v root="$ROOT" -v only="$ONLY" -v now="$NOW_EPOCH" -v nowts="$NOW_TS" -v ready_only="$READY_ONLY" \
  -v lease_min="$(cfg leases.minutes 60)" -v task_h="$(cfg staleness.task_hours 4)" \
  -v issue_h="$(cfg staleness.issue_hours 24)" '
BEGIN { while ((getline f < listfile) > 0) ARGV[ARGC++] = f; close(listfile) }
function epoch(ts,   y, m, d, hh, mm, rest, sign, oh, om, off, yy, era, yoe, mp, doy, doe) {
  if (ts !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]/) return 0
  y = substr(ts, 1, 4) + 0; m = substr(ts, 6, 2) + 0; d = substr(ts, 9, 2) + 0
  hh = substr(ts, 12, 2) + 0; mm = substr(ts, 15, 2) + 0
  rest = substr(ts, 17)
  if (rest ~ /^:[0-9][0-9]/) rest = substr(rest, 4)
  sub(/^\.[0-9]+/, "", rest)
  off = 0
  if (rest ~ /^[+-][0-9][0-9]:?[0-9][0-9]/) {
    sign = (substr(rest, 1, 1) == "-") ? -1 : 1
    oh = substr(rest, 2, 2) + 0
    om = (substr(rest, 4, 1) == ":") ? substr(rest, 5, 2) + 0 : substr(rest, 4, 2) + 0
    off = sign * (oh * 3600 + om * 60)
  }
  yy = (m <= 2) ? y - 1 : y
  era = int(yy / 400); yoe = yy - era * 400
  mp = (m + 9) % 12
  doy = int((153 * mp + 2) / 5) + d - 1
  doe = yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy
  return (era * 146097 + doe - 719468) * 86400 + hh * 3600 + mm * 60 - off
}
function ago(sec,   m, h, dd) {
  if (sec < 0) sec = -sec
  m = int(sec / 60); h = int(m / 60); dd = int(h / 24)
  if (m < 60) return m "m"
  if (h < 48) return h "h " (m % 60) "m"
  return dd "d " (h % 24) "h"
}
function unq(v) { sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v); gsub(/^"|"$/, "", v); gsub(/`/, "", v); return v }
function rel(p) { return (index(p, root "/") == 1) ? substr(p, length(root) + 2) : p }
function prefix_of(g,   i, c) {
  g = unq(g)
  for (i = 1; i <= length(g); i++) { c = substr(g, i, 1); if (c == "*" || c == "?" || c == "[" || c == "{") return substr(g, 1, i - 1) }
  return g
}
function overlap(a, b,   na, nb, i, j, x, y, A, B) {
  if (a == "" || b == "") return 0
  na = split(a, A, /, */); nb = split(b, B, /, */)
  for (i = 1; i <= na; i++) for (j = 1; j <= nb; j++) {
    x = prefix_of(A[i]); y = prefix_of(B[j])
    if (x == "" || y == "") continue
    if (index(x, y) == 1 || index(y, x) == 1) return 1
  }
  return 0
}
function dirname(p) { sub(/\/[^\/]*$/, "", p); return p }
function basename(p) { sub(/^.*\//, "", p); return p }
function show(d) { return (only == "" || d == only) }
function lease_state(c, l) { if (c == "" || l == "") return "none"; return (epoch(l) > now) ? "live" : "expired" }

FNR == 1 { infm = 0; fence = 0; sec = ""; inmeta = 0; cur_task = ""; cur_req = ""; cur_ts = 0; lastcrit = ""
           file = FILENAME; dir = dirname(file); kind = basename(file)
           if (kind == "goal.md") { nd++; D[nd] = dir; hasgoal[dir] = 1 } }
FNR == 1 && $0 == "---" { infm = 1; next }
infm && $0 == "---" { infm = 0; next }
infm {
  if (match($0, /^[A-Za-z_]+:/)) {
    key = substr($0, 1, RLENGTH - 1); val = substr($0, RLENGTH + 1)
    if (kind == "goal.md") {
      if (key == "id") G_id[dir] = unq(val)
      else if (key == "title") G_title[dir] = unq(val)
      else if (key == "status") G_status[dir] = unq(val)
      else if (key == "priority") G_priority[dir] = unq(val)
      else if (key == "size") G_size[dir] = unq(val)
      else if (key == "owner") G_owner[dir] = unq(val)
      else if (key == "claimed_by") G_claimed[dir] = unq(val)
      else if (key == "lease_until") G_lease[dir] = unq(val)
      else if (key == "blocked_by") G_blocked[dir] = unq(val)
    } else if (kind == "current_state.md") {
      if (key == "summary") S_summary[dir] = unq(val)
      else if (key == "updated_at") S_updated[dir] = unq(val)
      else if (key == "updated_by") S_by[dir] = unq(val)
    }
  }
  next
}
/^(```|~~~)/ { fence = !fence; next }
fence { next }

kind == "goal.md" {
  if ($0 ~ /^- \[[ xX]\] SC-[0-9]+:/) {
    C_total[dir]++; lastcrit = ($0 ~ /^- \[[xX]\]/) ? "ticked" : "open"
    if (lastcrit == "ticked") C_ticked[dir]++
    evid_seen = 0
  } else if ($0 ~ /^  - evidence:/ && lastcrit == "ticked" && !evid_seen) { C_verified[dir]++; evid_seen = 1 }
  next
}

kind == "plan.md" {
  if ($0 ~ /^### T-[0-9]+:/) {
    cur_task = $0; sub(/^### /, "", cur_task); tid = cur_task; sub(/:.*/, "", tid)
    title = cur_task; sub(/^T-[0-9]+: */, "", title)
    NT[dir]++; TID[dir, NT[dir]] = tid; k = dir SUBSEP tid
    T_title[k] = title; T_status[k] = "todo"; T_lane[k] = "main"; inmeta = 1; cur_key = k
    next
  }
  if ($0 ~ /^(#|##|###) /) { inmeta = 0; cur_key = ""; next }
  if (cur_key != "") {
    if (inmeta && match($0, /^- [a-z_]+:/)) {
      mk = substr($0, 3, RLENGTH - 3); mv = unq(substr($0, RLENGTH + 1))
      if (mk == "status") T_status[cur_key] = mv
      else if (mk == "lane") T_lane[cur_key] = mv
      else if (mk == "depends_on") T_deps[cur_key] = mv
      else if (mk == "owns") T_owns[cur_key] = mv
      else if (mk == "claimed_by") T_claimed[cur_key] = mv
      else if (mk == "lease_until") T_lease[cur_key] = mv
      else if (mk == "satisfies") T_sat[cur_key] = mv
      next
    }
    inmeta = 0
    if ($0 ~ /^- \[[ xX]\] /) { ST_total[cur_key]++; if ($0 ~ /^- \[[xX]\]/) ST_done[cur_key]++ }
  }
  next
}

kind == "current_state.md" {
  if ($0 ~ /^## /) { sec = substr($0, 4); cur_req = ""; next }
  if (sec == "Needs you") {
    if ($0 ~ /^- \[[ xX]\] Q-[0-9a-z]+:/) {
      NR_[dir]++; cur_req = dir SUBSEP NR_[dir]
      R_done[cur_req] = ($0 ~ /^- \[[xX]\]/)
      line = $0; sub(/^- \[[ xX]\] /, "", line); R_id[cur_req] = line; sub(/:.*/, "", R_id[cur_req])
      sub(/^Q-[0-9a-z]+: */, "", line); R_q[cur_req] = line
    } else if (cur_req != "" && match($0, /^  - [a-z_]+:/)) {
      rk = substr($0, 5, RLENGTH - 5); rv = unq(substr($0, RLENGTH + 1))
      if (rk == "from") R_from[cur_req] = rv; else if (rk == "to") R_to[cur_req] = rv
      else if (rk == "urgency") R_urg[cur_req] = rv; else if (rk == "kind") R_kind[cur_req] = rv
    }
  } else if (sec == "Next steps" && $0 ~ /^1\. /) { S_next[dir] = substr($0, 4) }
  next
}

kind == "changes.md" {
  if ($0 ~ /^## [0-9]/) {
    split($0, hp, " "); cur_ts = epoch(hp[2]); CH_n[dir]++
    if (cur_ts > CH_last[dir]) { CH_last[dir] = cur_ts; CH_last_line[dir] = substr($0, 4) }
  } else if (match($0, /^- task: T-[0-9]+/)) {
    ct = substr($0, 9, RLENGTH - 8); ck = dir SUBSEP ct
    if (cur_ts > CH_task[ck]) CH_task[ck] = cur_ts
  }
  next
}

END {
  # ---- per issue: lease state, live leases for the owns check
  for (i = 1; i <= nd; i++) {
    d = D[i]; st = G_status[d]; if (st == "") st = "backlog"
    ID2DIR[G_id[d]] = d
    cs[d] = lease_state(G_claimed[d], G_lease[d])
    for (j = 1; j <= NT[d]; j++) {
      tk = d SUBSEP TID[d, j]; ts_ = T_status[tk]
      TL[tk] = (ts_ == "done" || ts_ == "cancelled") ? "none" : lease_state(T_claimed[tk], T_lease[tk])
      if (TL[tk] == "live") { nl++; LK[nl] = tk; LO[nl] = T_owns[tk] }
    }
  }

  # ---- ready tasks
  for (i = 1; i <= nd; i++) {
    d = D[i]; st = G_status[d]
    if (st != "planned" && st != "in_progress") continue
    for (j = 1; j <= NT[d]; j++) {
      tid = TID[d, j]; tk = d SUBSEP tid
      if (T_status[tk] != "todo" || TL[tk] == "live") continue
      ok = 1; nd_ = split(T_deps[tk], DEP, /, */)
      for (x = 1; x <= nd_; x++) {
        dep = DEP[x]; if (dep == "") continue
        if (index(dep, "#")) { dd = ID2DIR[substr(dep, 1, index(dep, "#") - 1)]; dt = substr(dep, index(dep, "#") + 1) }
        else { dd = d; dt = dep }
        if (T_status[dd SUBSEP dt] != "done") { ok = 0; break }
      }
      if (!ok) continue
      for (x = 1; x <= nl; x++) if (LK[x] != tk && overlap(T_owns[tk], LO[x])) { ok = 0; break }
      if (!ok) continue
      nready++; RD[nready] = d SUBSEP tid
      RD_blocked[nready] = ""
      nb = split(G_blocked[d], BB, /[\[\], ]+/)
      for (x = 1; x <= nb; x++) if (BB[x] != "" && ID2DIR[BB[x]] != "" && G_status[ID2DIR[BB[x]]] != "done") RD_blocked[nready] = RD_blocked[nready] " " BB[x]
    }
  }
  if (ready_only) {
    for (r = 1; r <= nready; r++) {
      split(RD[r], P, SUBSEP); d = P[1]; tk = d SUBSEP P[2]
      if (!show(d)) continue
      printf "%s %s [%s] %s%s\n", G_id[d], P[2], T_lane[tk], T_title[tk], (RD_blocked[r] != "" ? " (issue blocked_by" RD_blocked[r] ")" : "")
      shown++
    }
    if (!shown) print "No ready tasks."
    exit 0
  }

  printf "wf status · %s · %s\n", (only == "" ? root : rel(only)), nowts

  # ---- one issue: header block
  if (only != "") {
    d = only; st = G_status[d]
    coord = (G_claimed[d] != "") ? sprintf("coordinator %s (lease %s)", G_claimed[d], (cs[d] == "live" ? ago(epoch(G_lease[d]) - now) " left" : (cs[d] == "expired" ? "expired " ago(now - epoch(G_lease[d])) " ago" : "none"))) : "no coordinator"
    printf "%s %s · %s · %s · %s · owner %s · %s\n", G_id[d], G_title[d], st, (G_priority[d] == "" ? "none" : G_priority[d]), (G_size[d] == "" ? "m" : G_size[d]), (G_owner[d] == "" ? "none" : G_owner[d]), coord
    printf "path: %s\n", rel(d)
    tdone = 0; trev = 0; tprog = 0; ttodo = 0; tblk = 0
    for (j = 1; j <= NT[d]; j++) { s = T_status[d SUBSEP TID[d, j]]; if (s == "done") tdone++; else if (s == "review") trev++; else if (s == "in_progress") tprog++; else if (s == "blocked") tblk++; else if (s == "todo") ttodo++ }
    nrd = 0; for (r = 1; r <= nready; r++) { split(RD[r], P, SUBSEP); if (P[1] == d) nrd++ }
    printf "Criteria: %d of %d ticked, %d with evidence · Tasks: %d of %d done (%d in progress, %d review, %d blocked, %d todo, %d ready)\n", C_ticked[d] + 0, C_total[d] + 0, C_verified[d] + 0, tdone, NT[d] + 0, tprog, trev, tblk, ttodo, nrd
    if (S_summary[d] != "") printf "Now: %s (updated %s ago by %s)\n", S_summary[d], ago(now - epoch(S_updated[d])), S_by[d]
    else print "Now: no current_state.md. Run the handing-off skill."
    if (S_next[d] != "") printf "Next: %s\n", S_next[d]
    if (CH_last_line[d] != "") printf "Last change: %s\n", CH_last_line[d]
  } else {
    for (i = 1; i <= nd; i++) { st = G_status[D[i]]; if (st == "") st = "backlog"; cnt[st]++; total++ }
    printf "Issues (%d)  backlog %d · planned %d · in_progress %d · blocked %d · review %d · done %d · cancelled %d\n", total, cnt["backlog"], cnt["planned"], cnt["in_progress"], cnt["blocked"], cnt["review"], cnt["done"], cnt["cancelled"]
  }

  # ---- needs you
  for (pass = 1; pass <= 2; pass++) for (i = 1; i <= nd; i++) {
    d = D[i]; if (!show(d)) continue
    for (j = 1; j <= NR_[d]; j++) {
      rk = d SUBSEP j; blocking = (R_urg[rk] == "blocking")
      if ((pass == 1) != blocking) continue
      nn++
      NL[nn] = sprintf("  %-8s %s %s  %s -> %s  %s%s", (R_urg[rk] == "" ? "fyi" : R_urg[rk]), G_id[d], R_id[rk], R_from[rk], R_to[rk], R_q[rk], (R_done[rk] ? "  [answered: remove the item and log the answer with logging-work]" : ""))
    }
  }
  printf "Needs you (%d)\n", nn + 0
  for (x = 1; x <= nn; x++) print NL[x]

  # ---- expired leases and stale work
  for (i = 1; i <= nd; i++) {
    d = D[i]; if (!show(d)) continue; st = G_status[d]
    if (st == "done" || st == "cancelled") continue
    if (cs[d] == "expired") { ne++; EL[ne] = sprintf("  %s (coordinator) %s expired %s ago (%s)", G_id[d], G_claimed[d], ago(now - epoch(G_lease[d])), G_lease[d]) }
    for (j = 1; j <= NT[d]; j++) {
      tk = d SUBSEP TID[d, j]
      if (TL[tk] == "expired") { ne++; EL[ne] = sprintf("  %s %s %s expired %s ago (%s)", G_id[d], TID[d, j], T_claimed[tk], ago(now - epoch(T_lease[tk])), T_lease[tk]) }
      if (T_status[tk] == "in_progress") {
        fresh = CH_task[tk] + 0; renew = (T_lease[tk] != "") ? epoch(T_lease[tk]) - lease_min * 60 : 0
        if (renew > fresh) fresh = renew
        if (now - fresh > task_h * 3600) { ns++; SL[ns] = sprintf("  %s %s in_progress: no change entry or lease renewal for %s (limit %sh)", G_id[d], TID[d, j], ago(now - fresh), task_h) }
      }
    }
    if (st == "in_progress") {
      fresh = CH_last[d] + 0; su = epoch(S_updated[d]); if (su > fresh) fresh = su
      if (now - fresh > issue_h * 3600) { ns++; SL[ns] = sprintf("  %s issue in_progress: no change entry or state update for %s (limit %sh)", G_id[d], ago(now - fresh), issue_h) }
    }
  }
  printf "Leases expired (%d)\n", ne + 0
  for (x = 1; x <= ne; x++) print EL[x]
  printf "Stale (%d)\n", ns + 0
  for (x = 1; x <= ns; x++) print SL[x]

  # ---- ready
  nr_ = 0
  for (r = 1; r <= nready; r++) { split(RD[r], P, SUBSEP); if (show(P[1])) nr_++ }
  printf "Ready tasks (%d)\n", nr_
  for (r = 1; r <= nready; r++) {
    split(RD[r], P, SUBSEP); d = P[1]; if (!show(d)) continue; tk = d SUBSEP P[2]
    printf "  %s %s [%s] %s%s\n", G_id[d], P[2], T_lane[tk], T_title[tk], (RD_blocked[r] != "" ? " (issue blocked_by" RD_blocked[r] ")" : "")
  }
  if (only == "") print "Commits, pull requests and CI: pass an issue id to include them."
}
'

# ---- git, pull requests and CI (one issue only; every missing source is skipped and named)
[ -n "$ONLY" ] && [ "$READY_ONLY" -eq 0 ] || exit 0
ID="$(sed -n 's/^id: *//p' "$ONLY/goal.md" | head -1 | tr -d '"' | tr -d "'" )"
echo "Git, pull requests and CI for $ID"
if [ "$USE_GIT" -eq 0 ]; then echo "  skipped (--no-git)"; exit 0; fi

if ! command -v git >/dev/null 2>&1; then
  echo "  commits: skipped, git is not installed"
elif ! git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  echo "  commits: skipped, $REPO is not in a git repository"
else
  COMMITS="$(git -C "$REPO" log --all -n 10 --date=short --format='  %h %ad %s' --fixed-strings --grep="$ID" 2>/dev/null || true)"
  if [ -n "$COMMITS" ]; then echo "  commits (git log --grep \"$ID\"):"; echo "$COMMITS"
  else echo "  commits: none mention $ID (add the trailer 'Issue: $ID' to commits)"; fi
  BRANCHES="$(git -C "$REPO" branch --all --list "*$ID*" 2>/dev/null | sed 's/^[* ] *//' || true)"
  [ -z "$BRANCHES" ] || { echo "  branches:"; echo "$BRANCHES" | sed 's/^/    /'; }
fi

TO=""; command -v timeout >/dev/null 2>&1 && TO="timeout 25"
if ! command -v gh >/dev/null 2>&1; then
  echo "  pull requests and CI: skipped, gh is not installed"
elif ! $TO gh auth status >/dev/null 2>&1; then
  echo "  pull requests and CI: skipped, gh is not signed in or has no network"
else
  if PRS="$(cd "$REPO" && $TO gh pr list --search "\"$ID\"" --state all --limit 10 \
      --json number,title,state,url --jq '.[] | "  #\(.number) \(.state) \(.title) \(.url)"' 2>&1)"; then
    if [ -n "$PRS" ]; then echo "  pull requests (gh pr list --search \"$ID\"):"; echo "$PRS"
    else echo "  pull requests: none found for $ID"; fi
  else
    echo "  pull requests: skipped, $(echo "$PRS" | head -1)"
  fi
  RUNS=""; SHAS="$(git -C "$REPO" log --all -n 3 --format=%H --fixed-strings --grep="$ID" 2>/dev/null || true)"
  for sha in $SHAS; do
    R="$(cd "$REPO" && $TO gh run list --commit "$sha" --limit 3 --json status,conclusion,workflowName,headBranch,url \
      --jq '.[] | "  \(.workflowName) \(.status) \(.conclusion) on \(.headBranch) \(.url)"' 2>/dev/null || true)"
    [ -z "$R" ] || RUNS="$RUNS$R"$'\n'
  done
  if [ -z "$RUNS" ]; then
    BR="$(git -C "$REPO" branch --all --list "*$ID*" 2>/dev/null | sed 's/^[* ] *//; s#^remotes/[^/]*/##' | head -1 || true)"
    [ -z "$BR" ] || RUNS="$(cd "$REPO" && $TO gh run list --branch "$BR" --limit 3 --json status,conclusion,workflowName,headBranch,url \
      --jq '.[] | "  \(.workflowName) \(.status) \(.conclusion) on \(.headBranch) \(.url)"' 2>/dev/null || true)"
  fi
  if [ -n "$RUNS" ]; then echo "  CI runs (gh run list --commit/--branch):"; printf '%s' "$RUNS"
  else echo "  CI runs: none found for the commits or branches of $ID"; fi
fi
