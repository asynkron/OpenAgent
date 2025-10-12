#!/bin/bash
set -e

current_branch=$(git rev-parse --abbrev-ref HEAD)
parent_file=".git/stack/${current_branch}.parent"

if [ ! -f "$parent_file" ]; then
  echo "No parent found for $current_branch. Maybe you are at the root like main?"
  exit 1
fi

parent_branch=$(cat "$parent_file")

echo "Merging $current_branch into $parent_branch..."
git checkout "$parent_branch"
git merge --no-ff "$current_branch" -m "Merge branch '$current_branch' into '$parent_branch'"

echo "Cleaning up $current_branch..."
git branch -d "$current_branch" >/dev/null 2>&1 || {
  echo "Could not delete $current_branch automatically, unmerged changes?"
}

# Remove metadata file
rm -f "$parent_file"

# Best effort: remove any empty files in .git/stack
find .git/stack -type f -empty -delete 2>/dev/null || true

echo "Done. Now on branch: $(git rev-parse --abbrev-ref HEAD)"
