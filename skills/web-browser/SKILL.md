---
name: web-browser
description: Browser automation via Chrome DevTools Protocol. Navigate, evaluate JS, take screenshots, pick elements, extract content, and inspect network/console activity.
---

# Browser Tools

Self-contained CDP tools for agent-assisted web automation. No MCP server required — everything runs as standalone scripts over raw WebSocket.

## Prerequisites

- Node.js (`command -v node`)

## Setup

Run once before first use:

```bash
cd {baseDir}
npm install
```

## Manage Browser Instances

```bash
cdp start                # Rsync user's profile into isolated dir, then launch
cdp start --new-profile  # Launch with a clean empty profile
cdp list                 # Show all running instances
cdp info                 # Show details for the instance on :9222
cdp stop                 # Stop the instance on :9222
cdp stop --all           # Stop all instances
cdp restart              # Restart the instance on :9222
cdp logs                 # Tail the log for the instance on :9222
```

Launches Chromium with remote debugging on `:9222` (auto-assigned if taken). By default, rsyncs `CHROME_USER_DATA_DIR` into an isolated profile so the browser has your cookies and logins without touching your real profile.

If `cdp start` launches on a port other than `9222`, pass `--port <PORT>` to the helper scripts.

Run `cdp --help` for full docs.

## Navigate

```bash
{baseDir}/nav.js <url>              # Navigate current tab
{baseDir}/nav.js <url> --new        # Open in new tab
{baseDir}/nav.js --port 9223 <url>
```

## Evaluate JavaScript

```bash
{baseDir}/eval.js "document.title"
{baseDir}/eval.js "[...document.querySelectorAll('h2')].map(e => e.textContent)"
{baseDir}/eval.js --port 9223 "document.querySelector('#price').textContent"
```

Expressions are wrapped in an async IIFE, so `await` works. Results are printed as JSON for arrays/objects, raw for primitives.

### Common Patterns

Use `eval.js` for interactions that don't need dedicated scripts:

```bash
# Click an element
{baseDir}/eval.js "document.querySelector('button.submit').click()"

# Fill a form field
{baseDir}/eval.js "document.querySelector('#email').value = 'test@example.com'"

# Fill and submit a form
{baseDir}/eval.js "const f = document.querySelector('form'); f.querySelector('#user').value = 'alice'; f.querySelector('#pass').value = 'secret'; f.submit()"

# Get all links on page
{baseDir}/eval.js "[...document.querySelectorAll('a')].map(a => ({text: a.textContent.trim(), href: a.href})).filter(a => a.text)"

# Scroll to bottom
{baseDir}/eval.js "window.scrollTo(0, document.body.scrollHeight)"

# Wait for an element to appear
{baseDir}/eval.js "await new Promise(r => { const i = setInterval(() => { if (document.querySelector('.results')) { clearInterval(i); r(); }}, 200); setTimeout(() => { clearInterval(i); r(); }, 10000); })"

# Get computed styles
{baseDir}/eval.js "getComputedStyle(document.querySelector('.header')).backgroundColor"

# Type into an input (triggers events)
{baseDir}/eval.js "const el = document.querySelector('#search'); el.value = 'query'; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}))"

# Get page metadata
{baseDir}/eval.js "({title: document.title, url: location.href, description: document.querySelector('meta[name=description]')?.content})"
```

## Take Screenshot

```bash
{baseDir}/screenshot.js               # Saves PNG to tmpdir, prints path
{baseDir}/screenshot.js --port 9223
```

Read the printed file path to view the screenshot.

## Manage Tabs

```bash
{baseDir}/tabs.js                     # List all open tabs
{baseDir}/tabs.js select <index>      # Activate tab by index
{baseDir}/tabs.js close <index>       # Close tab by index
```

## Pick Elements

```bash
{baseDir}/pick.js "Click the submit button"
{baseDir}/pick.js --port 9223 "Select the data rows"
```

**IMPORTANT**: Use this when the user wants to select specific DOM elements on the page. Launches an interactive picker overlay — the user clicks elements in the browser to select them:

- **Click** — select one element and finish
- **Cmd/Ctrl+Click** — add to multi-selection
- **Enter** — confirm multi-selection
- **ESC** — cancel

Returns structured info per element: tag, id, class, text, HTML snippet, parent chain. Use when you need specific selectors but the page structure is complex or ambiguous.

## Extract Page Content

```bash
{baseDir}/content.js <url>
{baseDir}/content.js --port 9223 <url>
```

Navigate to URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on JS-rendered pages (waits for load).

## Inspect Cookies

```bash
{baseDir}/cookies.js
{baseDir}/cookies.js --port 9223
```

Dump all cookies for the current tab: name, value, domain, path, httpOnly, secure.

## Dismiss Cookie Consent

```bash
{baseDir}/dismiss-cookies.js               # Accept cookies
{baseDir}/dismiss-cookies.js --reject       # Reject/decline cookies
{baseDir}/dismiss-cookies.js --port 9223
```

Auto-dismiss cookie consent dialogs. Handles OneTrust, Cookiebot, Didomi, Quantcast, Usercentrics, TrustArc, Klaro, CookieYes, and generic banners. Checks iframes too.

## Watch Console & Network

```bash
{baseDir}/watch.js &                  # Start background logger
{baseDir}/watch.js --port 9223 &
```

Background daemon that captures console output, JS exceptions, network requests/responses, and browser logs to JSONL files under `~/.local/state/cdp/watch/`.

### View Logs

```bash
{baseDir}/logs.js                     # Show latest log
{baseDir}/logs.js --follow            # Tail latest log (live)
{baseDir}/logs.js --summary           # Summarize network activity
{baseDir}/logs.js --file <path>       # Use specific log file
```
