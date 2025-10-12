#!/bin/bash
set -e

current_branch=$(git rev-parse --abbrev-ref HEAD)

# Find all existing branches that start with current_branch_ followed by a number
existing_branches=$(git branch --format='%(refname:short)' | grep "^${current_branch}_[0-9]\+$" || true)

# Determine next number
if [ -z "$existing_branches" ]; then
  next_num=1
else
  # Extract numbers and find max
  max_num=$(echo "$existing_branches" | sed "s/^${current_branch}_//" | sort -n | tail -1)
  next_num=$((max_num + 1))
fi

# Construct new branch name
new_branch="${current_branch}_${next_num}"

# Create metadata folder if needed
mkdir -p .git/stack

# Record the parent relationship
echo "$current_branch" > ".git/stack/${new_branch}.parent"

# Create and checkout new branch
git checkout -b "$new_branch"

echo "Created and switched to new branch: $new_branch (parent: $current_branch)"
