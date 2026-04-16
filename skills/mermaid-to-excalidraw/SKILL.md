---
name: mermaid-to-excalidraw
description: >
  Convert Mermaid diagrams to editable Excalidraw drawings, opened in the
  user's default browser. Use when the user wants to visualise, edit, or
  export a Mermaid diagram as an Excalidraw canvas.
---

# Mermaid → Excalidraw

## Usage

Pass the Mermaid definition as an argument or pipe via stdin:

```bash
node ./render.mjs "<mermaid definition>"
```

```bash
node ./render.mjs <<'EOF'
flowchart TD
    A([Start]) --> B{Decision}
    B -- Yes --> C[Do thing]
    B -- No --> D[Skip]
    C --> E([End])
    D --> E
EOF
```

A local server starts, opens the diagram in the default browser as an editable Excalidraw canvas, and prints the URL. The user clicks **"⏹ Stop Server"** when done.

## Mermaid label tips

- **Line breaks:** `\n` is a literal backslash-n in Mermaid labels — it does **not** create a new line. Always use `<br/>` for line breaks inside node labels, e.g. `A["First line<br/>Second line"]`.

## Supported diagram types

Flowchart, Sequence, Class, and ER diagrams render as native Excalidraw elements. Other types (State, Gantt, etc.) still render but as an embedded SVG image — viewable, not individually editable.

## Build / Update

The skill ships with a pre-built `dist/`. To rebuild or update to the latest upstream:

```bash
bash ./build.sh
```

Requires: git, yarn, node.
