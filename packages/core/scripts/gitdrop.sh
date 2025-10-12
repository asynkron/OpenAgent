#!/bin/bash
set -e

current_branch=$(git rev-parse --abbrev-ref HEAD)
parent_file=".git/stack/${current_branch}.parent"

if [ ! -f "$parent_file" ]; then
  echo "No parent found for $current_branch. Maybe you are at the root like main?"
  exit 1
fi

parent_branch=$(cat "$parent_file")

# Optional guard: refuse to drop if there are uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "You have uncommitted changes on $current_branch. Commit or stash before dropping."
  exit 1
fi

echo "Dropping $current_branch and switching back to $parent_branch..."
git checkout "$parent_branch"
git branch -D "$current_branch"

rm -f "$parent_file"

echo "Dropped $current_branch. Now on branch: $(git rev-parse --abbrev-ref HEAD)"
