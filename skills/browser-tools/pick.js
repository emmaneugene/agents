#!/usr/bin/env node

/**
 * Interactive DOM element picker for the active browser tab.
 *
 * Injects a visual overlay that lets the user click elements to select them.
 * A banner at the bottom shows the provided message and instructions.
 *
 * Interactions (in the browser):
 *   Click              - Select a single element and finish immediately.
 *   Cmd/Ctrl + Click   - Add element to multi-selection (keeps picker open).
 *   Enter              - Confirm and return all accumulated selections.
 *   ESC                - Cancel and return nothing.
 *
 * For each selected element: tag, id, class, text (200 chars), html (500 chars), parents.
 *
 * Usage:
 *   browser-pick.js "Click the submit button"
 *   browser-pick.js --port 9223 "Click the submit button"
 */

import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;
const msgParts = [];

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	} else {
		msgParts.push(args[i]);
	}
}

const message = msgParts.join(" ");
if (!message) {
	console.log("Usage: browser-pick.js [--port PORT] '<message>'");
	console.log("\nExample:");
	console.log('  browser-pick.js "Click the submit button"');
	console.log('  browser-pick.js --port 9223 "Select the login form"');
	process.exit(1);
}

try {
	const cdp = await connect({ port });
	const { sessionId } = await cdp.getActivePage();

	// Inject the pick() helper and invoke it
	const result = await cdp.evaluate(
		sessionId,
		`
		(async () => {
			// Inject pick() if not already present
			if (!window.__agentPick) {
				window.__agentPick = (message) => {
					return new Promise((resolve) => {
						const selections = [];
						const selectedElements = new Set();

						const overlay = document.createElement("div");
						overlay.style.cssText =
							"position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none";

						const highlight = document.createElement("div");
						highlight.style.cssText =
							"position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.1s";
						overlay.appendChild(highlight);

						const banner = document.createElement("div");
						banner.style.cssText =
							"position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647";

						const updateBanner = () => {
							banner.textContent = message + " (" + selections.length + " selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)";
						};
						updateBanner();

						document.body.append(banner, overlay);

						const cleanup = () => {
							document.removeEventListener("mousemove", onMove, true);
							document.removeEventListener("click", onClick, true);
							document.removeEventListener("keydown", onKey, true);
							overlay.remove();
							banner.remove();
							selectedElements.forEach((el) => { el.style.outline = ""; });
						};

						const onMove = (e) => {
							const el = document.elementFromPoint(e.clientX, e.clientY);
							if (!el || overlay.contains(el) || banner.contains(el)) return;
							const r = el.getBoundingClientRect();
							highlight.style.cssText = "position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);top:" + r.top + "px;left:" + r.left + "px;width:" + r.width + "px;height:" + r.height + "px";
						};

						const buildInfo = (el) => {
							const parents = [];
							let cur = el.parentElement;
							while (cur && cur !== document.body) {
								let s = cur.tagName.toLowerCase();
								if (cur.id) s += "#" + cur.id;
								if (cur.className) s += "." + cur.className.trim().split(/\\s+/).join(".");
								parents.push(s);
								cur = cur.parentElement;
							}
							return {
								tag: el.tagName.toLowerCase(),
								id: el.id || null,
								class: el.className || null,
								text: (el.textContent || "").trim().slice(0, 200) || null,
								html: el.outerHTML.slice(0, 500),
								parents: parents.join(" > "),
							};
						};

						const onClick = (e) => {
							if (banner.contains(e.target)) return;
							e.preventDefault();
							e.stopPropagation();
							const el = document.elementFromPoint(e.clientX, e.clientY);
							if (!el || overlay.contains(el) || banner.contains(el)) return;

							if (e.metaKey || e.ctrlKey) {
								if (!selectedElements.has(el)) {
									selectedElements.add(el);
									el.style.outline = "3px solid #10b981";
									selections.push(buildInfo(el));
									updateBanner();
								}
							} else {
								cleanup();
								resolve(selections.length > 0 ? selections : buildInfo(el));
							}
						};

						const onKey = (e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								cleanup();
								resolve(null);
							} else if (e.key === "Enter" && selections.length > 0) {
								e.preventDefault();
								cleanup();
								resolve(selections);
							}
						};

						document.addEventListener("mousemove", onMove, true);
						document.addEventListener("click", onClick, true);
						document.addEventListener("keydown", onKey, true);
					});
				};
			}

			return window.__agentPick(${JSON.stringify(message)});
		})()
	`,
		60000, // longer timeout — user is interacting
	);

	if (result === null) {
		console.log("(cancelled)");
	} else if (Array.isArray(result)) {
		for (let i = 0; i < result.length; i++) {
			if (i > 0) console.log("");
			for (const [key, value] of Object.entries(result[i])) {
				console.log(`${key}: ${value}`);
			}
		}
	} else if (typeof result === "object") {
		for (const [key, value] of Object.entries(result)) {
			console.log(`${key}: ${value}`);
		}
	}

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
}
