#!/usr/bin/env bash
# install-skills.sh: install the wf skills (plugins/workflow/skills) for Codex or Claude Code.
#
#   scripts/install-skills.sh --codex [TARGET]      copy the skills for Codex.
#                                                   TARGET defaults to <repo>/.agents/skills
#   scripts/install-skills.sh --claude [TARGET]     copy the skills for Claude Code.
#                                                   TARGET defaults to <repo>/.claude/skills
#   scripts/install-skills.sh --claude-plugin       print the /plugin commands that install the
#                                                   plugin from the repo's own marketplace
#   scripts/install-skills.sh --print-agents-md     print a short AGENTS.md snippet that tells
#                                                   Codex to use the skills
#
# Options: --dry-run (show what would happen, write nothing), -h/--help.
# Install all skills together: they point at each other with relative paths
# (../using-wf/references/format.md). Re-running updates the copies; it only replaces folders
# named like our skills. Plain bash and cp; works on macOS bash 3.2.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/plugins/workflow/skills"

die() { echo "install-skills: $*" >&2; exit 1; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"; }

[ -d "$SRC" ] || die "no skills folder at $SRC"

DRY=0 DO_CODEX=0 DO_CLAUDE=0 DO_PLUGIN=0 DO_AGENTS=0 CODEX_TARGET="" CLAUDE_TARGET=""

# An option may be followed by a target folder; the next word is the target unless it is a flag.
next_is_value() { [ $# -ge 2 ] && case "$2" in --*|-h) return 1 ;; *) return 0 ;; esac; }

[ $# -gt 0 ] || { usage; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --codex) DO_CODEX=1; if next_is_value "$@"; then CODEX_TARGET="$2"; shift; fi ;;
    --claude) DO_CLAUDE=1; if next_is_value "$@"; then CLAUDE_TARGET="$2"; shift; fi ;;
    --claude-plugin) DO_PLUGIN=1 ;;
    --print-agents-md) DO_AGENTS=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install-skills: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

abs() { # absolute path of a possibly missing folder, relative to the current folder
  case "$1" in
    "~") echo "$HOME" ;;
    "~/"*) echo "$HOME/${1#\~/}" ;;
    /*) echo "$1" ;;
    *) echo "$PWD/$1" ;;
  esac
}

skill_names() {
  local d
  for d in "$SRC"/*/; do
    [ -f "${d}SKILL.md" ] && basename "$d"
  done
}

install_to() { # install_to <label> <target folder>
  local label="$1" target name n=0
  target="$(abs "$2")"
  echo "Installing the wf skills for $label into $target"
  [ "$DRY" -eq 1 ] || mkdir -p "$target"
  for name in $(skill_names); do
    if [ "$DRY" -eq 1 ]; then
      echo "  would install $name"
    else
      rm -rf "${target:?}/$name"
      cp -R "$SRC/$name" "$target/$name"
      find "$target/$name" -name '.DS_Store' -delete 2>/dev/null || true
      find "$target/$name" -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
      echo "  installed $name"
    fi
    n=$((n + 1))
  done
  if [ "$DRY" -eq 0 ] && [ ! -f "$target/using-wf/references/format.md" ]; then
    die "using-wf/references/format.md is missing in $target; the skills would not find the formats"
  fi
  echo "  $n skills"
}

plugin_commands() {
  local url slug=""
  url="$(git -C "$REPO" remote get-url origin 2>/dev/null || true)"
  case "$url" in
    git@github.com:*) slug="${url#git@github.com:}" ;;
    https://github.com/*) slug="${url#https://github.com/}" ;;
  esac
  slug="${slug%.git}"
  echo "Claude Code plugin (marketplace workflow-marketplace, plugin workflow):"
  echo
  echo "  # inside a Claude Code session, from a local clone"
  echo "  /plugin marketplace add $REPO"
  echo "  /plugin install workflow@workflow-marketplace"
  echo "  /reload-plugins"
  if [ -n "$slug" ]; then
    echo
    echo "  # or straight from GitHub"
    echo "  /plugin marketplace add $slug"
    echo "  /plugin install workflow@workflow-marketplace"
  fi
  echo
  echo "  # shell, shared with the team through the committed .claude/settings.json"
  echo "  claude plugin marketplace add ${slug:-$REPO} --scope project"
  echo "  claude plugin install workflow@workflow-marketplace --scope project"
  echo
  echo "The skills then appear as /workflow:using-wf, /workflow:adding-work, ..."
}

agents_md() {
  cat <<'EOF'
## wf workflow skills

Work in this repo is tracked as markdown in a wf workspace (`workflow.toml`; the prototype one is `web/mock/workspace`). The skills in `.agents/skills` run the whole flow without the dashboard, and the dashboard shows every change you make.

- Start with the `using-wf` skill. It finds the workspace and lists the other skills.
- To add work or one issue, use `adding-work`. To plan an issue, use `planning-issues`.
- To continue an issue ("Work on wf-3k9x2", "do the next step"), use `doing-next-step`. Read the issue's `current_state.md` first. An issue without a plan is planned first, in the same run.
- To record a change, a decision or a learning, use `logging-work`. To hand an issue over, use `handing-off`. For status, requests, pull requests and CI, use `checking-status`.
- Edit the markdown with minimal changes in the contract format. Never rewrite a file or an old log entry.
- End every commit for an issue with the trailer line `Issue: <issue id>`.
- Set `WF_AUTHOR` to your handle (for Codex: `codex`).
EOF
}

if [ "$DO_CODEX" -eq 1 ]; then install_to "Codex" "${CODEX_TARGET:-$REPO/.agents/skills}"; fi
if [ "$DO_CLAUDE" -eq 1 ]; then
  install_to "Claude Code" "${CLAUDE_TARGET:-$REPO/.claude/skills}"
  echo "  (or install the plugin: scripts/install-skills.sh --claude-plugin)"
fi
if [ "$DO_PLUGIN" -eq 1 ]; then plugin_commands; fi
if [ "$DO_AGENTS" -eq 1 ]; then agents_md; fi
if [ "$DO_CODEX" -eq 1 ] && [ "$DO_AGENTS" -eq 0 ]; then
  echo "Next: scripts/install-skills.sh --print-agents-md >> AGENTS.md"
fi
