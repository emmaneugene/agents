#!/usr/bin/env node

/**
 * Extract readable content from a URL as Markdown.
 *
 * Navigates to the URL, waits for load, extracts the main article with
 * Mozilla Readability, then converts to GitHub-Flavored Markdown via Turndown.
 *
 * Usage:
 *   browser-content.js <url>
 *   browser-content.js --port 9223 <url>
 */

import { connect } from "./lib/client.js";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);
let port = 9222;
let url = null;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--port") {
		port = parseInt(args[++i], 10);
	} else {
		url = args[i];
	}
}

if (!url) {
	console.log("Usage: browser-content.js [--port PORT] <url>");
	console.log("\nExamples:");
	console.log("  browser-content.js https://example.com");
	console.log("  browser-content.js --port 9223 https://example.com");
	process.exit(1);
}

const globalTimeout = setTimeout(() => {
	console.error("Timeout (30s)");
	process.exit(1);
}, 30000);

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

try {
	const cdp = await connect({ port });
	const { sessionId } = await cdp.getActivePage();

	// Navigate and wait for load
	await cdp.navigate(sessionId, url);
	await cdp.send("Page.enable", {}, sessionId);
	await Promise.race([
		new Promise((resolve) => {
			const off = cdp.on("Page.loadEventFired", () => {
				off();
				resolve();
			});
		}),
		new Promise((r) => setTimeout(r, 10000)),
	]);

	// Small extra delay for dynamic content
	await new Promise((r) => setTimeout(r, 1000));

	// Get the final URL from the page
	const finalUrl = await cdp.evaluate(sessionId, "window.location.href");

	// Get full HTML via DOM domain (works even with TrustedScriptURL restrictions)
	const outerHTML = await cdp.getDocument(sessionId);

	// Extract with Readability
	const doc = new JSDOM(outerHTML, { url: finalUrl });
	const reader = new Readability(doc.window.document);
	const article = reader.parse();

	let content;
	if (article?.content) {
		content = htmlToMarkdown(article.content);
	} else {
		// Fallback: strip noise, extract main content
		const fallbackDoc = new JSDOM(outerHTML, { url: finalUrl });
		const fallbackBody = fallbackDoc.window.document;
		fallbackBody
			.querySelectorAll("script, style, noscript, nav, header, footer, aside")
			.forEach((el) => el.remove());
		const main =
			fallbackBody.querySelector("main, article, [role='main'], .content, #content") ||
			fallbackBody.body;
		const fallbackHtml = main?.innerHTML || "";
		content =
			fallbackHtml.trim().length > 100
				? htmlToMarkdown(fallbackHtml)
				: "(Could not extract content)";
	}

	console.log(`URL: ${finalUrl}`);
	if (article?.title) console.log(`Title: ${article.title}`);
	console.log("");
	console.log(content);

	cdp.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
} finally {
	clearTimeout(globalTimeout);
	setTimeout(() => process.exit(0), 100);
}
