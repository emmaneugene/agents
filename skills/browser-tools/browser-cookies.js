#!/usr/bin/env bun

/**
 * Dump all cookies for the active browser tab.
 *
 * Output format (one block per cookie):
 *   <name>: <value>
 *     domain: ...
 *     path: ...
 *     httpOnly: true|false
 *     secure: true|false
 */

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
let port = "9222";

if (args[0] === "--port") {
	port = args[1];
	args.splice(0, 2);
}

const b = await Promise.race([
	puppeteer.connect({
		browserURL: `http://localhost:${port}`,
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error(`  Run: cdp start --port ${port}`);
	process.exit(1);
});

const p = (await b.pages()).at(-1);

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

const cookies = await p.cookies();

for (const cookie of cookies) {
	console.log(`${cookie.name}: ${cookie.value}`);
	console.log(`  domain: ${cookie.domain}`);
	console.log(`  path: ${cookie.path}`);
	console.log(`  httpOnly: ${cookie.httpOnly}`);
	console.log(`  secure: ${cookie.secure}`);
	console.log("");
}

await b.disconnect();
