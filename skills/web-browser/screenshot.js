#!/usr/bin/env node

/**
 * Capture the current viewport as a PNG screenshot.
 *
 * Saves to a temp file and prints the path. The agent can then
 * read the image file to view it.
 *
 * Usage:
 *   screenshot.js
 *   screenshot.js --port 9223
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	}
}

const globalTimeout = setTimeout(() => {
	console.error("Timeout (15s)");
	process.exit(1);
}, 15000);

try {
	const cdp = await connect({ port });
	const { sessionId } = await cdp.getActivePage();

	const data = await cdp.screenshot(sessionId);

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filepath = join(tmpdir(), `screenshot-${timestamp}.png`);
	writeFileSync(filepath, data);
	console.log(filepath);

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
} finally {
	clearTimeout(globalTimeout);
	setTimeout(() => process.exit(0), 100);
}
