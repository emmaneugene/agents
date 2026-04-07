#!/usr/bin/env node
/**
 * mermaid-to-excalidraw/render.mjs
 *
 * Renders a Mermaid diagram as Excalidraw in the default browser.
 * Injects the definition into the playground via localStorage and auto-triggers render.
 * A floating "⏹ Stop Server" button in the browser hits GET /__shutdown to exit cleanly.
 *
 * Usage:
 *   node render.mjs "<mermaid definition>"
 *   node render.mjs <<'EOF'
 *   flowchart TD
 *     A-->B
 *   EOF
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn } from "node:child_process";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(SKILL_DIR, "dist");

// ── Read mermaid definition ──────────────────────────────────────────────────

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    if (process.stdin.isTTY) resolve("");
  });
}

const definition = process.argv[2]?.trim() || (await readStdin());

if (!definition) {
  console.error('Usage: node render.mjs "<mermaid definition>"');
  process.exit(1);
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(
    `Error: dist/ not found at ${DIST_DIR}\n` +
      `Run: bash ${path.join(SKILL_DIR, "build.sh")} first.`,
  );
  process.exit(1);
}

// ── Daemonize ────────────────────────────────────────────────────────────────
// If not already running as a daemon, spawn a detached copy of this script
// and exit immediately. The daemon writes the URL to stdout then closes it,
// which signals the parent to print it and exit.

if (!process.env.MERMAID_RENDER_DAEMON) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), definition], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, MERMAID_RENDER_DAEMON: "1" },
  });

  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => (out += d));
  child.stdout.on("end", () => {
    process.stdout.write(out);
    child.unref();
    process.exit(0);
  });
} else {

// ── MIME types ───────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".json": "application/json",
};

// ── Bootstrap script injected into index.html ─────────────────────────────

const STORAGE_KEY = "mermaid-to-excalidraw-definition";

function buildBootstrapScript(def) {
  const defJson = JSON.stringify(def);
  return `
<script id="__mermaid-skill-bootstrap__">
(function () {
  const DEF = ${defJson};
  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};

  // Pre-load definition into localStorage before React mounts
  try { localStorage.setItem(STORAGE_KEY, DEF); } catch(e) {}

  // Once React mounts, click "Render to Excalidraw"
  const pollRender = setInterval(function () {
    const btn = document.getElementById('render-excalidraw-btn');
    if (btn) {
      clearInterval(pollRender);
      btn.click();
    }
  }, 100);

  // Add floating Stop Server button
  window.addEventListener('load', function () {
    var stopBtn = document.createElement('button');
    stopBtn.textContent = '⏹ Stop Server';
    stopBtn.style.cssText = [
      'position:fixed', 'top:12px', 'right:16px', 'z-index:99999',
      'padding:8px 14px', 'font-size:13px', 'font-weight:600',
      'border:none', 'border-radius:8px', 'background:#ef4444',
      'color:#fff', 'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
      'font-family:system-ui,sans-serif',
    ].join(';');
    stopBtn.addEventListener('click', function () {
      stopBtn.textContent = 'Stopping…';
      stopBtn.disabled = true;
      fetch('/__shutdown').finally(function () { window.close(); });
    });
    document.body.appendChild(stopBtn);
  });
})();
</script>`;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch (_) {}

  // Shutdown endpoint
  if (urlPath === "/__shutdown") {
    res.writeHead(200);
    res.end("bye");
    server.close(() => process.exit(0));
    return;
  }

  const filePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const fullPath = path.join(DIST_DIR, filePath);

  if (!fullPath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    let body = data;

    if (filePath === "index.html") {
      const html = data.toString("utf8");
      const script = buildBootstrapScript(definition);
      const injected = html.includes("</head>")
        ? html.replace("</head>", script + "\n</head>")
        : script + html;
      body = Buffer.from(injected, "utf8");
    }

    res.writeHead(200, { "Content-Type": mime });
    res.end(body);
  });
});

// ── Start server, open browser, show stop button ──────────────────────────

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  // Open in default browser
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${opener} "${url}"`);

  // Signal the parent process that we're ready and it can exit
  process.stdout.write(`\nMermaid → Excalidraw\n  ${url}\n`);
  process.stdout.end();
});

} // end daemon guard
