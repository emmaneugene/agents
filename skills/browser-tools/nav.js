#!/usr/bin/env node

/**
 * Navigate the active tab to a URL, or open a URL in a new tab.
 *
 * Usage:
 *   nav.js <url>            # Navigate current tab
 *   nav.js <url> --new      # Open in new tab
 *   nav.js --port 9223 <url>
 */

import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;
let newTab = false;
let url = null;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	} else if (args[i] === "--new") {
		newTab = true;
	} else {
		url = args[i];
	}
}

if (!url) {
	console.log("Usage: nav.js [--port PORT] [--new] <url>");
	console.log("\nExamples:");
	console.log("  nav.js https://example.com");
	console.log("  nav.js https://example.com --new");
	console.log("  nav.js --port 9223 https://example.com");
	process.exit(1);
}

const globalTimeout = setTimeout(() => {
	console.error("Timeout (45s)");
	process.exit(1);
}, 45000);

try {
	const cdp = await connect({ port });

	let targetId;
	if (newTab) {
		const result = await cdp.send("Target.createTarget", { url: "about:blank" });
		targetId = result.targetId;
	} else {
		const pages = await cdp.getPages();
		const page = pages.at(-1);
		if (!page) {
			console.error("No active tab found");
			process.exit(1);
		}
		targetId = page.targetId;
	}

	const sessionId = await cdp.attachToPage(targetId);
	await cdp.navigate(sessionId, url);

	console.log(newTab ? "Opened:" : "Navigated to:", url);
	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
} finally {
	clearTimeout(globalTimeout);
	setTimeout(() => process.exit(0), 100);
}
