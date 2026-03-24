#!/usr/bin/env node

/**
 * List, select, or close browser tabs.
 *
 * Usage:
 *   tabs.js                        # List all tabs
 *   tabs.js list                   # Same as above
 *   tabs.js select <index>         # Activate tab by index (from list output)
 *   tabs.js close <index>          # Close tab by index
 *   tabs.js --port 9223 list
 */

import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;
const positional = [];

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	} else {
		positional.push(args[i]);
	}
}

const command = positional[0] || "list";
const index = positional[1] != null ? parseInt(positional[1], 10) : null;

const globalTimeout = setTimeout(() => {
	console.error("Timeout (10s)");
	process.exit(1);
}, 10000);

try {
	const cdp = await connect({ port });
	const pages = await cdp.getPages();

	if (command === "list") {
		if (pages.length === 0) {
			console.log("No open tabs.");
		} else {
			for (let i = 0; i < pages.length; i++) {
				const p = pages[i];
				console.log(`[${i}] ${p.title || "(untitled)"}`);
				console.log(`    ${p.url}`);
			}
		}
	} else if (command === "select") {
		if (index == null || index < 0 || index >= pages.length) {
			console.error(`Invalid index. Use 0-${pages.length - 1}`);
			process.exit(1);
		}
		await cdp.send("Target.activateTarget", { targetId: pages[index].targetId });
		console.log(`Activated: [${index}] ${pages[index].title || pages[index].url}`);
	} else if (command === "close") {
		if (index == null || index < 0 || index >= pages.length) {
			console.error(`Invalid index. Use 0-${pages.length - 1}`);
			process.exit(1);
		}
		await cdp.send("Target.closeTarget", { targetId: pages[index].targetId });
		console.log(`Closed: [${index}] ${pages[index].title || pages[index].url}`);
	} else {
		console.log("Usage: tabs.js [--port PORT] [list | select <index> | close <index>]");
		process.exit(1);
	}

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
} finally {
	clearTimeout(globalTimeout);
	setTimeout(() => process.exit(0), 100);
}
