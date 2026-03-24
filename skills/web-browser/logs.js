#!/usr/bin/env node

/**
 * View and analyze watch.js logs.
 *
 * Usage:
 *   logs.js                    # Show latest log file
 *   logs.js --follow           # Tail latest log (like tail -f)
 *   logs.js --summary          # Summarize network activity
 *   logs.js --file <path>      # Use a specific log file
 *   logs.js --port 9223        # (used with --summary to filter)
 */

import { openSync, readSync, closeSync, readdirSync, readFileSync, statSync, watchFile } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
let follow = false;
let summary = false;
let filePath = null;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--follow" || args[i] === "-f") follow = true;
	else if (args[i] === "--summary" || args[i] === "-s") summary = true;
	else if (args[i] === "--file") filePath = args[++i];
}

// ── Find latest log file ────────────────────────────────────────────

function findLatestLog() {
	const stateDir = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
	const watchDir = join(stateDir, "cdp", "watch");

	let dirs;
	try {
		dirs = readdirSync(watchDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
	} catch {
		return null;
	}

	for (const dir of dirs) {
		const dirPath = join(watchDir, dir);
		const files = readdirSync(dirPath)
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => ({ name: f, path: join(dirPath, f), mtime: statSync(join(dirPath, f)).mtimeMs }))
			.sort((a, b) => b.mtime - a.mtime);

		if (files.length > 0) return files[0].path;
	}
	return null;
}

const logFile = filePath || findLatestLog();

if (!logFile) {
	console.error("No log files found. Run watch.js first.");
	process.exit(1);
}

// ── Summary mode ────────────────────────────────────────────────────

if (summary) {
	const lines = readFileSync(logFile, "utf8").trim().split("\n");
	let requests = 0;
	let responses = 0;
	const statusCodes = {};
	const failures = [];

	for (const line of lines) {
		try {
			const entry = JSON.parse(line);
			if (entry.type === "network.request") requests++;
			if (entry.type === "network.response") {
				responses++;
				statusCodes[entry.status] = (statusCodes[entry.status] || 0) + 1;
			}
			if (entry.type === "network.failure") {
				failures.push({ error: entry.errorText, requestId: entry.requestId });
			}
		} catch {
			// Skip malformed lines
		}
	}

	console.log(`File: ${logFile}`);
	console.log(`Requests: ${requests}`);
	console.log(`Responses: ${responses}`);
	console.log("");

	if (Object.keys(statusCodes).length > 0) {
		console.log("Status codes:");
		for (const [code, count] of Object.entries(statusCodes).sort(([a], [b]) => a - b)) {
			console.log(`  ${code}: ${count}`);
		}
		console.log("");
	}

	if (failures.length > 0) {
		const show = failures.slice(0, 10);
		console.log(`Failures (${failures.length} total):`);
		for (const f of show) {
			console.log(`  ${f.error} (${f.requestId})`);
		}
		if (failures.length > 10) console.log(`  ... ${failures.length - 10} more`);
	}

	process.exit(0);
}

// ── Tail mode ───────────────────────────────────────────────────────

function formatEntry(entry) {
	const time = entry.ts?.slice(11, 19) || "??:??:??";

	switch (entry.type) {
		case "console":
			return `${time} [${entry.level}] ${(entry.args || []).join(" ")}`;
		case "exception":
			return `${time} [EXCEPTION] ${entry.text}${entry.description ? "\n  " + entry.description : ""}`;
		case "network.request":
			return `${time} [NET] ${entry.method} ${entry.url}`;
		case "network.response":
			return `${time} [NET] ${entry.status} ${entry.url}`;
		case "network.failure":
			return `${time} [NET FAIL] ${entry.errorText}`;
		case "log":
			return `${time} [${entry.level}] ${entry.text}`;
		case "attached":
			return `${time} [ATTACHED] ${entry.url}`;
		case "detached":
			return `${time} [DETACHED]`;
		case "info":
			return `${time} [INFO] ${entry.title} — ${entry.url}`;
		default:
			return `${time} [${entry.type}] ${JSON.stringify(entry)}`;
	}
}

// Print existing content
const content = readFileSync(logFile, "utf8");
let offset = Buffer.byteLength(content, "utf8");

for (const line of content.trim().split("\n")) {
	if (!line) continue;
	try {
		console.log(formatEntry(JSON.parse(line)));
	} catch {
		console.log(line);
	}
}

if (!follow) process.exit(0);

// Follow new content
console.log(`--- following ${logFile} ---`);

watchFile(logFile, { interval: 300 }, () => {
	try {
		const stat = statSync(logFile);
		if (stat.size <= offset) return;

		const fd = openSync(logFile, "r");
		const buf = Buffer.alloc(stat.size - offset);
		readSync(fd, buf, 0, buf.length, offset);
		closeSync(fd);
		offset = stat.size;

		for (const line of buf.toString("utf8").trim().split("\n")) {
			if (!line) continue;
			try {
				console.log(formatEntry(JSON.parse(line)));
			} catch {
				console.log(line);
			}
		}
	} catch {
		// File may have been rotated
	}
});
