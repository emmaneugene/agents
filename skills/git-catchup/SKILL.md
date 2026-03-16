---
name: git-catchup
description: >
  Fetches remote and summarises what changed on updated branches since last
  fetch. Use when asked to catch up on a repo, see what changed upstream,
  or review recent remote activity.
---

# Git Catchup

Fetch the remote and produce a scannable summary of what changed on each
updated branch.

## Workflow

### 1. Snapshot & Fetch

```bash
# Save current remote ref positions
git for-each-ref --format='%(refname) %(objectname)' refs/remotes/ > /tmp/catchup-before.txt

# Fetch everything, prune stale refs
git fetch --all --prune 2>&1

# Save new positions
git for-each-ref --format='%(refname) %(objectname)' refs/remotes/ > /tmp/catchup-after.txt
```

Compare the two files to find branches where the SHA changed or that are
newly created. Deleted branches can be noted but don't need summaries.

### 2. Filter

Exclude branches whose name matches any of these patterns (case-insensitive):

- `dependabot/`
- `renovate/`
- `snyk-`
- `gh-pages`

If the user provided `$1`, treat it as a **comma-separated list of
additional patterns** to exclude (substring match is fine).

### 3. Present the list

For each updated branch, show: **branch name** and **number of new commits**.

Sort by most-recent commit date, descending.

- **≤ 5 branches**: proceed to summarise all of them.
- **> 5 branches**: show the list and ask the user which ones to
  summarise. Accept numbers, branch names, `all`, or a grep pattern.

### 4. Summarise each selected branch

For each branch, look at **at most 20** new commits (the most recent ones
if there are more).

**Start cheap, escalate if needed:**

1. Read commit messages and `git diff --stat` for the commit range:
   ```bash
   git log --oneline <old-sha>..<new-sha> -20
   git diff --stat <old-sha>..<new-sha>
   ```
2. If the commit messages are low-signal (e.g. dominated by "fix", "wip",
   "update", merge commits, or squash blobs with no meaningful body),
   read the actual diffs for those unclear commits:
   ```bash
   git diff <old-sha>..<new-sha> -- <relevant paths>
   ```
   Keep it targeted — use the diffstat to pick the interesting files
   rather than dumping everything.

**Per branch, produce:**

- A **one-line TLDR** (what this batch of changes is about)
- Concise **bullets** for notable changes
- Mention of any large-scale operations (renames, deletions, new modules)

### 5. Output format

```
## <branch-name> (N new commits)

TLDR: <one sentence>

- bullet 1
- bullet 2
```

Group all branch summaries together. No filler, no recap of the process.
If a branch has > 20 new commits, note how many were skipped at the end of
its section.
