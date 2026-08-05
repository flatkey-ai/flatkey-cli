#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./release.sh [patch|minor|major|VERSION] [options]

Bump package.json, run tests, commit, tag, push branch + tag, and optionally watch npm publish workflow.

Options:
  -m, --message MESSAGE  Commit message. Default: chore: release vVERSION
  -y, --yes              Skip confirmation prompt.
  --no-test              Skip npm test.
  --no-watch             Do not watch GitHub Actions publish run.
  -h, --help             Show help.

Examples:
  ./release.sh
  ./release.sh minor
  ./release.sh 0.3.0 -m "feat: release v0.3.0"
EOF
}

bump="patch"
message=""
yes=0
run_tests=1
watch_publish=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major)
      bump="$1"
      shift
      ;;
    [0-9]*.[0-9]*.[0-9]*)
      bump="$1"
      shift
      ;;
    -m|--message)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      message="$2"
      shift 2
      ;;
    -y|--yes)
      yes=1
      shift
      ;;
    --no-test)
      run_tests=0
      shift
      ;;
    --no-watch)
      watch_publish=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd npm
require_cmd node

if [[ "$watch_publish" -eq 1 ]]; then
  require_cmd gh
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ ! -f package.json ]]; then
  echo "package.json not found at repo root." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "Detached HEAD. Checkout a branch before release." >&2
  exit 1
fi

current_version="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("package.json", "utf8")).version)')"
next_version="$(node - "$current_version" "$bump" <<'NODE'
const [current, bump] = process.argv.slice(2);
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) throw new Error(`Invalid package version: ${current}`);
const parts = match.slice(1).map(Number);
if (/^\d+\.\d+\.\d+$/.test(bump)) {
  console.log(bump);
} else if (bump === "major") {
  console.log(`${parts[0] + 1}.0.0`);
} else if (bump === "minor") {
  console.log(`${parts[0]}.${parts[1] + 1}.0`);
} else if (bump === "patch") {
  console.log(`${parts[0]}.${parts[1]}.${parts[2] + 1}`);
} else {
  throw new Error(`Invalid bump: ${bump}`);
}
NODE
)"

tag="v$next_version"
if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Tag already exists: $tag" >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "Remote tag already exists: $tag" >&2
  exit 1
fi

if [[ -z "$message" ]]; then
  message="chore: release $tag"
fi

echo "Branch: $branch"
echo "Version: $current_version -> $next_version"
echo "Tag: $tag"
echo "Commit: $message"
echo
echo "Changes to include:"
git status --short

if [[ "$yes" -ne 1 ]]; then
  echo
  read -r -p "Commit, tag, and push these changes? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
fi

npm version "$next_version" --no-git-tag-version >/dev/null

if [[ "$run_tests" -eq 1 ]]; then
  npm test
fi

git add -A
git commit -m "$message"
git tag "$tag"
git push origin "$branch"
git push origin "$tag"

if [[ "$watch_publish" -eq 1 ]]; then
  run_id=""
  for _ in {1..10}; do
    run_id="$(gh run list \
      --workflow npm-publish.yml \
      --branch "$tag" \
      --limit 1 \
      --json databaseId \
      --jq '.[0].databaseId // ""')"
    if [[ -n "$run_id" ]]; then
      break
    fi
    sleep 3
  done

  if [[ -n "$run_id" ]]; then
    gh run watch "$run_id" --exit-status
  else
    echo "Publish workflow not found yet for $tag."
  fi
fi

echo "Released $tag."
