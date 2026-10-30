#!/usr/bin/env bash
# wf-lib.sh: small helpers the library skills share. Plain bash and POSIX tools, no other dependency.
#
#   wf-lib.sh root                  print the folder of the personal library (a git clone)
#   wf-lib.sh parse <link>          print a GitHub link as key=value lines: owner repo kind rest alias url
#   wf-lib.sh dir <owner> <repo>    print where a team library is cloned: ~/.wf/libraries/<owner>/<repo>
#   wf-lib.sh slug <text>           print a kebab-case slug of at most 5 words
#
# root uses $WF_LIBRARY, else the one folder ~/.wf/libraries/<owner>/<repo> whose library.toml says
# kind = "personal". $WF_LIBRARIES replaces ~/.wf/libraries (tests and evals).
# parse accepts https://github.com/o/r, .../tree/<ref>/<path>, .../blob/<ref>/<path>.md,
# git@github.com:o/r.git and o/r. kind is repo, tree or blob; rest is what follows tree/ or blob/
# (ref and path together: a ref may hold slashes, so resolve it against the remote's branches).
# alias is the repo name in lowercase ("me" and "t" are taken by the routes, so they get "-library").
#
# Exit codes: 0 ok, 1 not found or bad value (the reason goes to stderr).
set -euo pipefail

die() { echo "wf-lib: $*" >&2; exit 1; }

libs_home() { printf '%s\n' "${WF_LIBRARIES:-$HOME/.wf/libraries}"; }

root() {
  if [ -n "${WF_LIBRARY:-}" ]; then
    [ -f "$WF_LIBRARY/library.toml" ] || die "WF_LIBRARY=$WF_LIBRARY has no library.toml"
    (cd "$WF_LIBRARY" && pwd); return
  fi
  local home f hits=""
  home="$(libs_home)"
  for f in "$home"/*/*/library.toml; do
    if [ -f "$f" ] && grep -Eq '^kind[[:space:]]*=[[:space:]]*"personal"' "$f"; then
      hits="$hits$(dirname "$f")"$'\n'
    fi
  done
  case "$(printf '%s' "$hits" | grep -c .)" in
    1) printf '%s' "$hits" ;;
    0) die "no personal library under $home. Set WF_LIBRARY, or create one (keeping-a-library, section 2)." ;;
    *) die "more than one personal library under $home. Set WF_LIBRARY." ;;
  esac
}

valid_owner() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]]; }
valid_repo() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]] && [ "$1" != "." ] && [ "$1" != ".." ]; }

parse() {
  local in="${1:-}" path owner repo more kind="repo" rest="" alias
  [ -n "$in" ] || die "parse needs a GitHub link"
  in="${in%%[?#]*}"; in="${in%/}"
  case "$in" in
    https://github.com/*|http://github.com/*) path="${in#*://github.com/}" ;;
    https://www.github.com/*) path="${in#https://www.github.com/}" ;;
    github.com/*) path="${in#github.com/}" ;;
    git@github.com:*) path="${in#git@github.com:}" ;;
    ssh://git@github.com/*) path="${in#ssh://git@github.com/}" ;;
    *://*|*@*:*) die "not a github.com link: $in" ;;
    */*) path="$in" ;;
    *) die "not a GitHub link or owner/repo: $in" ;;
  esac
  IFS=/ read -r owner repo more <<<"$path"
  repo="${repo%.git}"
  valid_owner "$owner" || die "not a GitHub owner: $owner"
  valid_repo "$repo" || die "not a GitHub repository name: $repo"
  if [ -n "$more" ]; then
    kind="${more%%/*}"
    case "$kind" in
      tree|blob) ;;
      *) die "only repository, tree and blob links are accepted: $in" ;;
    esac
    case "$more" in */*) rest="${more#*/}" ;; *) die "no branch in the link: $in" ;; esac
  fi
  alias="$(alias_of "$repo")"
  case "$alias" in me|t|"") alias="${alias:-library}-library" ;; esac
  printf 'owner=%s\nrepo=%s\nkind=%s\nrest=%s\nalias=%s\nurl=https://github.com/%s/%s\n' \
    "$owner" "$repo" "$kind" "$rest" "$alias" "$owner" "$repo"
}

# The default alias: the repo name in lowercase, other characters (not a-z 0-9 _ -) become "-".
alias_of() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/^[-_]+//; s/[-_]+$//'; }

# Lowercase words joined by "-": every run of other characters is one separator.
words_of() { printf '%s' "$*" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/ /g; s/^ +//; s/ +$//'; }
slug_of() { words_of "$*" | tr ' ' '-'; }
slug_short() { words_of "$*" | awk '{ n = NF > 5 ? 5 : NF; for (i = 1; i <= n; i++) printf "%s%s", $i, (i < n ? "-" : ""); print "" }'; }

case "${1:-}" in
  root) root ;;
  parse) parse "${2:-}" ;;
  dir) valid_owner "${2:-}" && valid_repo "${3:-}" || die "dir needs a valid <owner> and <repo>"
       printf '%s/%s/%s\n' "$(libs_home)" "$2" "$3" ;;
  slug) shift; [ $# -gt 0 ] || die "slug needs some text"; slug_short "$@" ;;
  ''|-h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" ;;
  *) die "unknown command '$1'. Run wf-lib.sh --help." ;;
esac
