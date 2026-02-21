---
name: browser-tools
description: Interactive browser automation via Chrome DevTools Protocol. Use in conjunction with chrome-devtools mcp server where necessary
---

# Browser Tools

Chrome DevTools Protocol tools for agent-assisted web automation.

> **Note:** Most browser interactions like navigation, JS eval, screenshots, clicking, form filling, network inspection, etc should be handled by the **chrome-devtools MCP**. This skill provides browser instance management and additional functionality.

## Setup

Run once before first use:

```bash
cd {baseDir}/browser-tools
bun install
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

Refer to `cdp --help` for full docs.

## Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load).

## When to Use

- Managing the browser process (start, stop, restart, logs)
- Letting the user interactively pick elements on the page
- Inspecting cookies for auth/session debugging
- Extracting clean readable markdown from a URL
