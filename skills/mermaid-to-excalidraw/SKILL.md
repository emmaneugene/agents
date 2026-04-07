---
name: mermaid-to-excalidraw
description: "Render a Mermaid diagram in Excalidraw in the user's default browser."
---

# Mermaid → Excalidraw

Use this skill when the user wants to visualise a Mermaid diagram in Excalidraw.

---

## Setup

The skill requires a pre-built copy of the mermaid-to-excalidraw playground in `dist/`.
Build it by cloning the upstream repo and running its own toolchain:

```bash
bash ~/.agents/skills/mermaid-to-excalidraw/build.sh
```

This will:
1. Clone `git@github.com:excalidraw/mermaid-to-excalidraw.git` to a temp dir
2. Run `yarn install --frozen-lockfile`
3. Run `yarn build:playground`
4. Copy the output into `dist/` in the skill directory
5. Clean up the temp dir

Takes ~2–3 minutes. Requires `git` and `yarn`.

## Updating

Re-run the same script to pull the latest upstream version:

```bash
bash ~/.agents/skills/mermaid-to-excalidraw/build.sh
```

---

## Usage

```bash
node ~/.agents/skills/mermaid-to-excalidraw/render.mjs "<mermaid definition>"
```

Or pipe via stdin for multi-line definitions:

```bash
node ~/.agents/skills/mermaid-to-excalidraw/render.mjs <<'EOF'
flowchart TD
    A([Start]) --> B{Decision}
    B -- Yes --> C[Do thing]
    B -- No --> D[Skip]
    C --> E([End])
    D --> E
EOF
```

### What happens

1. A local HTTP server starts and the diagram opens in your **default browser**
2. The Mermaid definition is auto-loaded and rendered immediately in Excalidraw
3. A **"⏹ Stop Server"** button floats in the top-right corner — click it when done

## Supported diagram types

| Type | Support |
|------|---------|
| Flowchart | ✅ Full |
| Sequence | ✅ Full |
| Class | ✅ Full |
| ER | ✅ Full |
| Others (including State) | ⚠️ Rendered as SVG image fallback |

---

## Notes

- The page is fully interactive — the user can edit the Mermaid definition in the left panel and re-render it
- Click **⏹ Stop Server** (top-right) to shut the server down when done
