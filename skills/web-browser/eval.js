#!/usr/bin/env node

/**
 * Evaluate a JavaScript expression in the active browser tab.
 *
 * The expression is wrapped in an async IIFE so you can use `await`.
 * Results are pretty-printed (arrays/objects as JSON, primitives as-is).
 *
 * Usage:
 *   eval.js "document.title"
 *   eval.js "document.querySelectorAll('a').length"
 *   eval.js --port 9223 "[...document.querySelectorAll('h2')].map(e => e.textContent)"
 */

import { connect } from "./lib/client.js";

const args = process.argv.slice(2);
let port = 9222;
const exprParts = [];

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	} else {
		exprParts.push(args[i]);
	}
}

const expression = exprParts.join(" ");

if (!expression) {
	console.log("Usage: eval.js [--port PORT] <expression>");
	console.log("\nExamples:");
	console.log('  eval.js "document.title"');
	console.log('  eval.js "document.querySelectorAll(\'a\').length"');
	console.log("  eval.js \"[...document.querySelectorAll('h2')].map(e => e.textContent)\"");
	process.exit(1);
}

const globalTimeout = setTimeout(() => {
	console.error("Timeout (45s)");
	process.exit(1);
}, 45000);

try {
	const cdp = await connect({ port });
	const { sessionId } = await cdp.getActivePage();

	// Wrap in async IIFE so await works
	const wrapped = `(async () => { return (${expression}); })()`;
	const result = await cdp.evaluate(sessionId, wrapped);

	if (result === undefined) {
		console.log("undefined");
	} else if (typeof result === "object" && result !== null) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(result);
	}

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
} finally {
	clearTimeout(globalTimeout);
	setTimeout(() => process.exit(0), 100);
}
