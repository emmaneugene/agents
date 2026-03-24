#!/usr/bin/env node

/**
 * Dump all cookies for the active browser tab.
 *
 * Output format (one block per cookie):
 *   <name>: <value>
 *     domain: ...
 *     path: ...
 *     httpOnly: true|false
 *     secure: true|false
 *
 * Usage:
 *   browser-cookies.js
 *   browser-cookies.js --port 9223
 */

import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	}
}

try {
	const cdp = await connect({ port });
	const { sessionId } = await cdp.getActivePage();

	const { cookies } = await cdp.send("Network.getCookies", {}, sessionId);

	for (const cookie of cookies) {
		console.log(`${cookie.name}: ${cookie.value}`);
		console.log(`  domain: ${cookie.domain}`);
		console.log(`  path: ${cookie.path}`);
		console.log(`  httpOnly: ${cookie.httpOnly}`);
		console.log(`  secure: ${cookie.secure}`);
		console.log("");
	}

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
}
