#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_PKG="$ROOT_DIR/package.json"

WORKSPACES=(
  packages/core
  packages/cli
  packages/desktop
  packages/server
  packages/web
)

# --- helpers ----------------------------------------------------------------

current_version() {
  node -p "require('$ROOT_PKG').version"
}

bump_semver() {
  local cur="$1" part="$2"
  IFS='.' read -r major minor patch <<< "$cur"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
  esac
}

usage() {
  echo "Usage: bump.sh <version | patch | minor | major>"
  echo ""
  echo "Examples:"
  echo "  bash scripts/bump.sh patch   # 0.2.9 → 0.2.10"
  echo "  bash scripts/bump.sh minor   # 0.2.9 → 0.3.0"
  echo "  bash scripts/bump.sh 1.0.0   # set exact version"
  exit 1
}

# --- parse args -------------------------------------------------------------

[[ $# -lt 1 ]] && usage

INPUT="$1"
CUR=$(current_version)

case "$INPUT" in
  patch|minor|major)
    VERSION=$(bump_semver "$CUR" "$INPUT")
    ;;
  *)
    if [[ ! "$INPUT" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "Error: '$INPUT' is not a valid semver version (X.Y.Z) or bump type (patch|minor|major)"
      exit 1
    fi
    VERSION="$INPUT"
    ;;
esac

echo "Bumping version: $CUR → $VERSION"
echo ""

# --- update all package.json files ------------------------------------------

echo "Updating root package.json..."
cd "$ROOT_DIR"
npm version "$VERSION" --no-git-tag-version --allow-same-version

for ws in "${WORKSPACES[@]}"; do
  echo "Updating $ws/package.json..."
  cd "$ROOT_DIR/$ws"
  npm version "$VERSION" --no-git-tag-version --allow-same-version
done

# --- update CLI core dependency ---------------------------------------------

echo "Updating CLI @michaelborck/cite-sight-core dependency to ^$VERSION..."
cd "$ROOT_DIR/packages/cli"
npm pkg set "dependencies.@michaelborck/cite-sight-core=^$VERSION"

# --- show diff & commit -----------------------------------------------------

cd "$ROOT_DIR"

echo ""
echo "=== Changes ==="
git diff -- '*.json'
echo ""

read -rp "Commit and tag v$VERSION? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Aborted. Changes are still staged in your working tree."
  exit 0
fi

git add -A '*.json'
git commit -m "chore: bump all package versions to $VERSION"
git tag -a "v$VERSION" -m "v$VERSION"

echo ""
echo "Committed and tagged v$VERSION."
echo ""

read -rp "Push commit and tag to origin? [y/N] " push_confirm
if [[ "$push_confirm" != [yY] ]]; then
  echo "Done. Run 'git push && git push --tags' when ready."
  exit 0
fi

git push
git push --tags
echo "Pushed to origin."
