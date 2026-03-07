---
name: tmux-tools
description: "Use tmux to run long-lived background tasks (servers, watchers, log tailing), execute tasks in parallel, or create collaborative sessions the user can audit. Load this skill when a task involves background processes, parallel execution, persistent monitoring, or when the user wants visibility into agent-run commands."
---

## Prerequisites

- `tmux` (`command -v tmux`)

## When to use `tmux`

### 1. Background tasks that outlive a single command

The agent needs to start something, continue working, and check back later.

Examples: dev servers, file watchers, `tail -f` on logs, `htop`, test suites, build processes, database migrations.

### 2. Parallel task execution

The agent needs to run multiple independent tasks simultaneously rather than sequentially. Each task gets its own session, and the agent polls them to track progress or collect results.

Examples: running tests and linting at the same time, kicking off multiple builds (`docker build`, `cargo build`), tailing several log files in separate sessions during debugging.

### 3. Collaborative / auditable sessions

The agent runs commands in a persistent session the user can attach to at any time. The scrollback buffer preserves full history — the user sees exactly what the agent did, in order.

Examples: exploratory debugging, multi-step deployments, anything the user explicitly wants to review.

---

## Commands

### Start a background task

Always use `remain-on-exit` so the session stays alive after the process exits and output can still be captured:

```bash
tmux new-session -d -s <name> "<command>" \; set-option -t <name> remain-on-exit on
```

For long-lived processes that never exit on their own (servers, watchers), it can be omitted:

```bash
tmux new-session -d -s <name> "<command>"
```

For complex commands (those with quotes, pipes, or env vars), wrap in `bash -c` with single quotes to avoid shell escaping issues:

```bash
tmux new-session -d -s <name> "bash -c '<command>'" \; set-option -t <name> remain-on-exit on
```

### Start a collaborative shell session

```bash
tmux new-session -d -s <name>
```

Send commands to it:

```bash
tmux send-keys -t <name> "<command>" Enter
```

Tell the user: *"Attach with `tmux attach -t <name>` to watch or review."*

### Check output

```bash
tmux capture-pane -t <name> -p -S -500
```

`-S -500` captures up to 500 lines of scrollback (clamped to whatever is available), avoiding both the truncation of the default visible-only capture and the potential flood of `-S -` on large buffers.

### Stop a session

```bash
tmux kill-session -t <name>
```

### Check if a task has finished

```bash
tmux display-message -t <name> -p '#{pane_dead}'         # 1 = exited, 0 = still running
tmux display-message -t <name> -p '#{pane_dead_status}'  # exit code (empty while still running)
```

Poll `pane_dead` to know when the process has finished, then read `pane_dead_status` to determine success (`0`) or failure (non-zero).

### Other useful commands

```bash
tmux ls                    # list sessions
tmux kill-server           # kill all sessions
tmux has-session -t <name> # check if session exists (exit code 0 = yes)
```

---

## Agent workflow

### For background tasks:

1. Pick a descriptive session name (`devserver`, `logs`, `tests`).
2. Start with `tmux new-session -d -s <name> "<command>" \; set-option -t <name> remain-on-exit on`.
3. Continue working on other things.
4. Poll `#{pane_dead}` to detect completion, then `#{pane_dead_status}` for exit code.
5. Read output with `tmux capture-pane -t <name> -p -S -500`.
6. When done, `tmux kill-session -t <name>`.

### For parallel tasks:

1. Start each task in its own session.
2. Continue working or wait.
3. Poll each session with `tmux capture-pane` to check for completion or errors.
4. Collect results, then kill all sessions.

### For collaborative sessions:

1. Start a shell session with `tmux new-session -d -s <name>`.
2. Run commands via `tmux send-keys`.
3. Tell the user the session name and attach command.
4. Check scrollback with `tmux capture-pane` as needed.
5. When finished, kill the session.

### Always:

- Tell the user the session name and how to attach/stop.
- Clean up sessions when the task is complete.
- Use `tmux ls` to avoid name collisions before creating sessions.
